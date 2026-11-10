package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"

	"social-network/internal/models"
)

type PollRepository struct {
	db *sql.DB
}

func NewPollRepository(db *sql.DB) *PollRepository {
	return &PollRepository{db: db}
}

// CreatePoll создает новый опрос с вариантами ответов
func (r *PollRepository) CreatePoll(creatorID int, req models.CreatePollRequest) (*models.Poll, error) {
	question := strings.TrimSpace(req.Question)
	if question == "" {
		return nil, errors.New("вопрос опроса не может быть пустым")
	}

	cleanOptions := make([]string, 0, len(req.Options))
	for _, opt := range req.Options {
		trimmed := strings.TrimSpace(opt)
		if trimmed != "" {
			cleanOptions = append(cleanOptions, trimmed)
		}
	}

	if len(cleanOptions) < 2 {
		return nil, errors.New("опрос должен содержать минимум 2 варианта ответа")
	}
	if len(cleanOptions) > 10 {
		return nil, errors.New("опрос не может содержать более 10 вариантов ответа")
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var pollID int
	query := `
		INSERT INTO polls (creator_id, question, is_multiple, is_anonymous, total_votes)
		VALUES ($1, $2, $3, $4, 0)
		RETURNING id, created_at
	`
	var poll models.Poll
	poll.CreatorID = creatorID
	poll.Question = question
	poll.IsMultiple = req.IsMultiple
	poll.IsAnonymous = req.IsAnonymous
	poll.TotalVotes = 0

	err = tx.QueryRow(query, creatorID, question, req.IsMultiple, req.IsAnonymous).Scan(&pollID, &poll.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert poll: %w", err)
	}
	poll.ID = pollID

	poll.Options = make([]models.PollOption, 0, len(cleanOptions))
	for _, optText := range cleanOptions {
		var optID int
		optQuery := `
			INSERT INTO poll_options (poll_id, text, votes_count)
			VALUES ($1, $2, 0)
			RETURNING id
		`
		err = tx.QueryRow(optQuery, pollID, optText).Scan(&optID)
		if err != nil {
			return nil, fmt.Errorf("insert poll option: %w", err)
		}
		poll.Options = append(poll.Options, models.PollOption{
			ID:         optID,
			PollID:     pollID,
			Text:       optText,
			VotesCount: 0,
			Percentage: 0,
		})
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &poll, nil
}

// GetPollByID получает опрос по ID со всеми вариантами, голосами и отметкой выбора пользователя
func (r *PollRepository) GetPollByID(pollID, currentUserID int) (*models.Poll, error) {
	query := `
		SELECT id, creator_id, question, is_multiple, is_anonymous, total_votes, created_at
		FROM polls
		WHERE id = $1
	`
	var poll models.Poll
	err := r.db.QueryRow(query, pollID).Scan(
		&poll.ID,
		&poll.CreatorID,
		&poll.Question,
		&poll.IsMultiple,
		&poll.IsAnonymous,
		&poll.TotalVotes,
		&poll.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("опрос не найден")
		}
		return nil, fmt.Errorf("query poll: %w", err)
	}

	// Загружаем варианты ответов
	optQuery := `
		SELECT id, poll_id, text, votes_count
		FROM poll_options
		WHERE poll_id = $1
		ORDER BY id ASC
	`
	rows, err := r.db.Query(optQuery, pollID)
	if err != nil {
		return nil, fmt.Errorf("query poll options: %w", err)
	}
	defer rows.Close()

	poll.Options = make([]models.PollOption, 0)
	for rows.Next() {
		var opt models.PollOption
		if err := rows.Scan(&opt.ID, &opt.PollID, &opt.Text, &opt.VotesCount); err != nil {
			return nil, fmt.Errorf("scan poll option: %w", err)
		}
		poll.Options = append(poll.Options, opt)
	}

	// Загружаем голоса текущего пользователя
	userVotesMap := make(map[int]bool)
	if currentUserID > 0 {
		voteQuery := `
			SELECT option_id
			FROM poll_votes
			WHERE poll_id = $1 AND user_id = $2
		`
		vRows, err := r.db.Query(voteQuery, pollID, currentUserID)
		if err == nil {
			defer vRows.Close()
			for vRows.Next() {
				var optID int
				if err := vRows.Scan(&optID); err == nil {
					userVotesMap[optID] = true
					poll.UserVotedOptionIDs = append(poll.UserVotedOptionIDs, optID)
				}
			}
		}
		poll.HasVoted = len(poll.UserVotedOptionIDs) > 0
	}

	// Рассчитываем проценты
	for i := range poll.Options {
		opt := &poll.Options[i]
		if userVotesMap[opt.ID] {
			opt.IsVoted = true
		}
		if poll.TotalVotes > 0 {
			opt.Percentage = math.Round((float64(opt.VotesCount) / float64(poll.TotalVotes)) * 100)
		} else {
			opt.Percentage = 0
		}
	}

	return &poll, nil
}

// VotePoll голосует за вариант ответа в опросе
func (r *PollRepository) VotePoll(pollID, optionID, userID int) (*models.Poll, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Проверяем опрос
	var isMultiple bool
	err = tx.QueryRow(`SELECT is_multiple FROM polls WHERE id = $1`, pollID).Scan(&isMultiple)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("опрос не найден")
		}
		return nil, fmt.Errorf("check poll: %w", err)
	}

	// Проверяем, что вариант принадлежит опросу
	var exists bool
	err = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM poll_options WHERE id = $1 AND poll_id = $2)`, optionID, pollID).Scan(&exists)
	if err != nil || !exists {
		return nil, errors.New("вариант ответа не принадлежит данному опросу")
	}

	// Проверяем, голосовал ли уже пользователь за этот вариант
	var alreadyVotedThis bool
	err = tx.QueryRow(`
		SELECT EXISTS(SELECT 1 FROM poll_votes WHERE poll_id = $1 AND option_id = $2 AND user_id = $3)
	`, pollID, optionID, userID).Scan(&alreadyVotedThis)
	if err != nil {
		return nil, fmt.Errorf("check user vote: %w", err)
	}

	if alreadyVotedThis {
		// Отмена голоса за этот вариант
		_, err = tx.Exec(`DELETE FROM poll_votes WHERE poll_id = $1 AND option_id = $2 AND user_id = $3`, pollID, optionID, userID)
		if err != nil {
			return nil, fmt.Errorf("remove vote: %w", err)
		}

		_, _ = tx.Exec(`UPDATE poll_options SET votes_count = GREATEST(0, votes_count - 1) WHERE id = $1`, optionID)
		_, _ = tx.Exec(`UPDATE polls SET total_votes = GREATEST(0, total_votes - 1) WHERE id = $1`, pollID)
	} else {
		// Если опрос НЕ множественный, снимаем предыдущие голоса
		if !isMultiple {
			var prevOptID int
			err = tx.QueryRow(`
				DELETE FROM poll_votes
				WHERE poll_id = $1 AND user_id = $2
				RETURNING option_id
			`, pollID, userID).Scan(&prevOptID)
			if err == nil {
				// Была предыдущая опция - уменьшаем её счетчик
				_, _ = tx.Exec(`UPDATE poll_options SET votes_count = GREATEST(0, votes_count - 1) WHERE id = $1`, prevOptID)
				_, _ = tx.Exec(`UPDATE polls SET total_votes = GREATEST(0, total_votes - 1) WHERE id = $1`, pollID)
			}
		}

		// Добавляем новый голос
		_, err = tx.Exec(`
			INSERT INTO poll_votes (poll_id, option_id, user_id)
			VALUES ($1, $2, $3)
		`, pollID, optionID, userID)
		if err != nil {
			return nil, fmt.Errorf("insert vote: %w", err)
		}

		_, _ = tx.Exec(`UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = $1`, optionID)
		_, _ = tx.Exec(`UPDATE polls SET total_votes = total_votes + 1 WHERE id = $1`, pollID)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit vote: %w", err)
	}

	return r.GetPollByID(pollID, userID)
}

// UnvotePoll отменяет все голоса пользователя в опросе
func (r *PollRepository) UnvotePoll(pollID, userID int) (*models.Poll, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	rows, err := tx.Query(`
		DELETE FROM poll_votes
		WHERE poll_id = $1 AND user_id = $2
		RETURNING option_id
	`, pollID, userID)
	if err != nil {
		return nil, fmt.Errorf("delete votes: %w", err)
	}

	optIDs := make([]int, 0)
	for rows.Next() {
		var oID int
		if err := rows.Scan(&oID); err == nil {
			optIDs = append(optIDs, oID)
		}
	}
	rows.Close()

	for _, oID := range optIDs {
		_, _ = tx.Exec(`UPDATE poll_options SET votes_count = GREATEST(0, votes_count - 1) WHERE id = $1`, oID)
	}
	if len(optIDs) > 0 {
		_, _ = tx.Exec(`UPDATE polls SET total_votes = GREATEST(0, total_votes - $1) WHERE id = $2`, len(optIDs), pollID)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit unvote: %w", err)
	}

	return r.GetPollByID(pollID, userID)
}

// UpdatePoll обновляет вопрос и варианты ответов опроса его создателем
func (r *PollRepository) UpdatePoll(pollID, currentUserID int, req models.UpdatePollRequest) (*models.Poll, error) {
	var creatorID int
	err := r.db.QueryRow(`SELECT creator_id FROM polls WHERE id = $1`, pollID).Scan(&creatorID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("опрос не найден")
		}
		return nil, fmt.Errorf("check poll owner: %w", err)
	}
	if creatorID != currentUserID {
		return nil, fmt.Errorf("у вас нет прав на редактирование этого опроса")
	}

	req.Question = strings.TrimSpace(req.Question)
	if req.Question == "" {
		return nil, fmt.Errorf("вопрос опроса не может быть пустым")
	}

	var cleanOpts []string
	for _, opt := range req.Options {
		t := strings.TrimSpace(opt)
		if t != "" {
			cleanOpts = append(cleanOpts, t)
		}
	}
	if len(cleanOpts) < 2 {
		return nil, fmt.Errorf("опрос должен содержать минимум 2 варианта ответа")
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE polls SET question = $1 WHERE id = $2`, req.Question, pollID)
	if err != nil {
		return nil, fmt.Errorf("update poll question: %w", err)
	}

	rows, err := tx.Query(`SELECT id, text, votes_count FROM poll_options WHERE poll_id = $1 ORDER BY id ASC`, pollID)
	if err != nil {
		return nil, fmt.Errorf("query existing options: %w", err)
	}
	type optInfo struct {
		id    int
		text  string
		votes int
	}
	var existing []optInfo
	for rows.Next() {
		var o optInfo
		if err := rows.Scan(&o.id, &o.text, &o.votes); err == nil {
			existing = append(existing, o)
		}
	}
	rows.Close()

	// Обновляем существующие варианты
	for i := 0; i < len(cleanOpts) && i < len(existing); i++ {
		_, err = tx.Exec(`UPDATE poll_options SET text = $1 WHERE id = $2`, cleanOpts[i], existing[i].id)
		if err != nil {
			return nil, fmt.Errorf("update option: %w", err)
		}
	}

	// Если добавлены новые варианты
	if len(cleanOpts) > len(existing) {
		for i := len(existing); i < len(cleanOpts); i++ {
			_, err = tx.Exec(`INSERT INTO poll_options (poll_id, text, votes_count) VALUES ($1, $2, 0)`, pollID, cleanOpts[i])
			if err != nil {
				return nil, fmt.Errorf("insert new option: %w", err)
			}
		}
	} else if len(cleanOpts) < len(existing) {
		// Если удалены неиспользованные варианты
		for i := len(cleanOpts); i < len(existing); i++ {
			if existing[i].votes == 0 {
				_, _ = tx.Exec(`DELETE FROM poll_options WHERE id = $1`, existing[i].id)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update poll: %w", err)
	}

	return r.GetPollByID(pollID, currentUserID)
}
