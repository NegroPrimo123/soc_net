package repository

import (
	"database/sql"

	"fmt"

	"strings"

	"math"
	"social-network/internal/models"

	"github.com/lib/pq"
)

type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {

	return &PostRepository{db: db}

}

func (r *PostRepository) GetFeed(currentUserID int, feedType, searchQuery, tagQuery string, limit, offset int) ([]models.Post, error) {

	if limit <= 0 {

		limit = 10

	}

	if limit > 50 {

		limit = 50

	}

	if offset < 0 {

		offset = 0

	}

	query := `

	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.music_url, ''), COALESCE(p.music_title, ''), COALESCE(p.music_artist, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		p.channel_id, p.poll_id,
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		COALESCE(p.likes_count, 0) as likes_count,
		COALESCE(p.comments_count, 0) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
		ch.id, COALESCE(ch.name, ''), COALESCE(ch.handle, ''), COALESCE(ch.avatar_url, ''), COALESCE(ch.subscribers_count, 0)
	FROM posts p
	JOIN users u ON u.id = p.user_id
	LEFT JOIN channels ch ON ch.id = p.channel_id
	WHERE 1=1

	`

	args := []interface{}{currentUserID}

	argIdx := 2

	if feedType == "following" {

		query += fmt.Sprintf(" AND (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1) OR p.user_id = $1)")

	}

	var isRankedSearch bool

	var searchArgIdx int

	if searchQuery != "" {

		isRankedSearch = true

		searchArgIdx = argIdx

		// Полнотекстовый поиск с морфологией (FTS) + Триграммы для поиска с опечатками (pg_trgm) + поиск по авторам

		query += fmt.Sprintf(` AND (

			p.search_vector @@ plainto_tsquery('russian', $%d)

			OR word_similarity($%d, p.content) > 0.25

			OR p.content ILIKE $%d

			OR u.username ILIKE $%d

			OR u.display_name ILIKE $%d

		)`, searchArgIdx, searchArgIdx, searchArgIdx+1, searchArgIdx+1, searchArgIdx+1)

		args = append(args, searchQuery, "%"+searchQuery+"%")

		argIdx += 2

	}

	if tagQuery != "" {

		cleanTag := strings.TrimPrefix(tagQuery, "#")

		query += fmt.Sprintf(` AND (

			p.content ILIKE $%d

			OR p.search_vector @@ plainto_tsquery('russian', $%d)

		)`, argIdx, argIdx+1)

		args = append(args, "%#"+cleanTag+"%", cleanTag)

		argIdx += 2

	}

	if isRankedSearch {

		// Ранжирование по релевантности: FTS ts_rank_cd + триграммная схожесть word_similarity

		query += fmt.Sprintf(` ORDER BY (

			ts_rank_cd(p.search_vector, plainto_tsquery('russian', $%d)) * 2.0 + 

			word_similarity($%d, p.content)

		) DESC, p.created_at DESC`, searchArgIdx, searchArgIdx)

	} else {

		query += " ORDER BY p.created_at DESC"

	}

	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.db.Query(query, args...)

	if err != nil {

		return nil, fmt.Errorf("query feed: %w", err)

	}

	defer rows.Close()

	var posts []models.Post

	var postIDs []int

	for rows.Next() {

		var p models.Post

		var chID sql.NullInt64
		var chName, chHandle, chAvatar sql.NullString
		var chSubs sql.NullInt64
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.MusicURL, &p.MusicTitle, &p.MusicArtist, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
			&p.ChannelID, &p.PollID,
			&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
			&p.LikesCount, &p.CommentsCount, &p.IsLiked,
			&chID, &chName, &chHandle, &chAvatar, &chSubs,
		); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		if chID.Valid {
			cID := int(chID.Int64)
			p.Channel = &models.Channel{
				ID:               cID,
				Name:             chName.String,
				Handle:           chHandle.String,
				AvatarURL:        chAvatar.String,
				SubscribersCount: int(chSubs.Int64),
			}
		}

		p.Comments = []models.Comment{}

		posts = append(posts, p)

		postIDs = append(postIDs, p.ID)

	}

	// Пакетная загрузка комментариев в 1 запрос (устранение N+1 запросов)

	if len(postIDs) > 0 {

		commentsMap, err := r.GetCommentsByPostIDs(postIDs)

		if err == nil {

			for i := range posts {

				if cmts, ok := commentsMap[posts[i].ID]; ok {
					posts[i].Comments = cmts
					if len(cmts) > posts[i].CommentsCount {
						posts[i].CommentsCount = len(cmts)
					}
				}

			}

		}

	}

	r.attachPollsToPosts(posts, currentUserID)
	return posts, nil
}

func (r *PostRepository) GetPostsByUserID(authorID, currentUserID int) ([]models.Post, error) {

	query := `

	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.music_url, ''), COALESCE(p.music_title, ''), COALESCE(p.music_artist, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		p.channel_id, p.poll_id,
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		COALESCE(p.likes_count, 0) as likes_count,
		COALESCE(p.comments_count, 0) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
		ch.id, COALESCE(ch.name, ''), COALESCE(ch.handle, ''), COALESCE(ch.avatar_url, ''), COALESCE(ch.subscribers_count, 0)
	FROM posts p
	JOIN users u ON u.id = p.user_id
	LEFT JOIN channels ch ON ch.id = p.channel_id
	WHERE p.user_id = $2 AND p.channel_id IS NULL

	ORDER BY p.created_at DESC

	LIMIT 50

	`

	rows, err := r.db.Query(query, currentUserID, authorID)

	if err != nil {

		return nil, fmt.Errorf("query user posts: %w", err)

	}

	defer rows.Close()

	var posts []models.Post

	var postIDs []int

	for rows.Next() {

		var p models.Post

		var chID sql.NullInt64
		var chName, chHandle, chAvatar sql.NullString
		var chSubs sql.NullInt64
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.MusicURL, &p.MusicTitle, &p.MusicArtist, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
			&p.ChannelID, &p.PollID,
			&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
			&p.LikesCount, &p.CommentsCount, &p.IsLiked,
			&chID, &chName, &chHandle, &chAvatar, &chSubs,
		); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		if chID.Valid {
			cID := int(chID.Int64)
			p.Channel = &models.Channel{
				ID:               cID,
				Name:             chName.String,
				Handle:           chHandle.String,
				AvatarURL:        chAvatar.String,
				SubscribersCount: int(chSubs.Int64),
			}
		}

		p.Comments = []models.Comment{}

		posts = append(posts, p)

		postIDs = append(postIDs, p.ID)

	}

	// Пакетная загрузка комментариев в 1 запрос (устранение N+1 запросов)

	if len(postIDs) > 0 {

		commentsMap, err := r.GetCommentsByPostIDs(postIDs)

		if err == nil {

			for i := range posts {

				if cmts, ok := commentsMap[posts[i].ID]; ok {
					posts[i].Comments = cmts
					if len(cmts) > posts[i].CommentsCount {
						posts[i].CommentsCount = len(cmts)
					}
				}

			}

		}

	}

	r.attachPollsToPosts(posts, currentUserID)
	return posts, nil
}

func (r *PostRepository) CreatePost(userID int, content, imageURL, musicURL, musicTitle, musicArtist string, channelID, pollID *int) (*models.Post, error) {
	var postID int
	query := `INSERT INTO posts (user_id, content, image_url, music_url, music_title, music_artist, channel_id, poll_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`
	err := r.db.QueryRow(query, userID, content, imageURL, musicURL, musicTitle, musicArtist, channelID, pollID).Scan(&postID)
	if err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}
	return r.GetPostByID(postID, userID)
}

func (r *PostRepository) UpdatePost(postID, userID int, content string, imageURL, musicURL, musicTitle, musicArtist *string) (*models.Post, error) {
	var err error
	var updatedID int

	query := `
	UPDATE posts 
	SET content = $1,
	    image_url = CASE WHEN $2::text IS NOT NULL THEN $2::text ELSE image_url END,
	    music_url = CASE WHEN $3::text IS NOT NULL THEN $3::text ELSE music_url END,
	    music_title = CASE WHEN $4::text IS NOT NULL THEN $4::text ELSE music_title END,
	    music_artist = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE music_artist END,
	    is_edited = TRUE, 
	    updated_at = NOW() 
	WHERE id = $6 AND user_id = $7 
	RETURNING id
	`
	err = r.db.QueryRow(query, content, imageURL, musicURL, musicTitle, musicArtist, postID, userID).Scan(&updatedID)

	if err != nil {
		return nil, fmt.Errorf("post not found or unauthorized: %w", err)
	}

	return r.GetPostByID(updatedID, userID)
}

func (r *PostRepository) GetPostByID(postID, currentUserID int) (*models.Post, error) {
	query := `
	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.music_url, ''), COALESCE(p.music_title, ''), COALESCE(p.music_artist, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		p.channel_id, p.poll_id,
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		COALESCE(p.likes_count, 0) as likes_count,
		COALESCE(p.comments_count, 0) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
		ch.id, COALESCE(ch.name, ''), COALESCE(ch.handle, ''), COALESCE(ch.avatar_url, ''), COALESCE(ch.subscribers_count, 0)
	FROM posts p
	JOIN users u ON u.id = p.user_id
	LEFT JOIN channels ch ON ch.id = p.channel_id
	WHERE p.id = $2
	`

	var p models.Post
	var chID sql.NullInt64
	var chName, chHandle, chAvatar sql.NullString
	var chSubs sql.NullInt64

	err := r.db.QueryRow(query, currentUserID, postID).Scan(
		&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.MusicURL, &p.MusicTitle, &p.MusicArtist, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
		&p.ChannelID, &p.PollID,
		&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
		&p.LikesCount, &p.CommentsCount, &p.IsLiked,
		&chID, &chName, &chHandle, &chAvatar, &chSubs,
	)
	if err == nil && chID.Valid {
		cID := int(chID.Int64)
		p.Channel = &models.Channel{
			ID:               cID,
			Name:             chName.String,
			Handle:           chHandle.String,
			AvatarURL:        chAvatar.String,
			SubscribersCount: int(chSubs.Int64),
		}
	}

	if err != nil {

		return nil, err

	}

	p.Comments, _ = r.GetComments(p.ID)
	if len(p.Comments) > p.CommentsCount {
		p.CommentsCount = len(p.Comments)
	}

	postsSlice := []models.Post{p}
	r.attachPollsToPosts(postsSlice, currentUserID)
	p = postsSlice[0]

	return &p, nil

}

func (r *PostRepository) ToggleLike(userID, postID int) (bool, int, error) {

	// 1. Попытка удалить существующий лайк за 1 атомарный запрос

	res, err := r.db.Exec("DELETE FROM likes WHERE user_id = $1 AND post_id = $2", userID, postID)

	if err != nil {

		return false, 0, err

	}

	rowsAffected, err := res.RowsAffected()

	if err != nil {

		return false, 0, err

	}

	var isLiked bool

	if rowsAffected > 0 {

		isLiked = false

	} else {

		// Лайка не было — вставляем с защитой от состояния гонки

		_, err = r.db.Exec("INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", userID, postID)

		if err != nil {

			return false, 0, err

		}

		isLiked = true

	}

	// 2. Получаем обновленный счетчик и синхронизируем колонку likes_count

	var count int

	err = r.db.QueryRow("SELECT COUNT(*) FROM likes WHERE post_id = $1", postID).Scan(&count)

	if err != nil {

		return false, 0, err

	}

	_, _ = r.db.Exec("UPDATE posts SET likes_count = $1 WHERE id = $2", count, postID)

	return isLiked, count, nil

}

// GetCommentsByPostIDs загружает комментарии для списка постов за один пакетный запрос (WHERE post_id = ANY($1))

func (r *PostRepository) GetCommentsByPostIDs(postIDs []int) (map[int][]models.Comment, error) {

	result := make(map[int][]models.Comment, len(postIDs))

	if len(postIDs) == 0 {

		return result, nil

	}

	query := `

	SELECT 

		c.id, c.post_id, c.user_id, c.content, COALESCE(c.is_edited, FALSE), c.created_at,

		u.id, u.username, u.display_name, u.avatar_url, u.bio

	FROM comments c

	JOIN users u ON u.id = c.user_id

	WHERE c.post_id = ANY($1)

	ORDER BY c.created_at ASC

	`

	rows, err := r.db.Query(query, pq.Array(postIDs))

	if err != nil {

		return nil, fmt.Errorf("query batch comments: %w", err)

	}

	defer rows.Close()

	for rows.Next() {

		var c models.Comment

		if err := rows.Scan(

			&c.ID, &c.PostID, &c.UserID, &c.Content, &c.IsEdited, &c.CreatedAt,

			&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.Bio,
		); err != nil {

			return nil, fmt.Errorf("scan batch comment: %w", err)

		}

		result[c.PostID] = append(result[c.PostID], c)

	}

	return result, nil

}

func (r *PostRepository) GetComments(postID int) ([]models.Comment, error) {

	query := `

	SELECT 

		c.id, c.post_id, c.user_id, c.content, COALESCE(c.is_edited, FALSE), c.created_at,

		u.id, u.username, u.display_name, u.avatar_url, u.bio

	FROM comments c

	JOIN users u ON u.id = c.user_id

	WHERE c.post_id = $1

	ORDER BY c.created_at ASC

	`

	rows, err := r.db.Query(query, postID)

	if err != nil {

		return nil, err

	}

	defer rows.Close()

	var comments []models.Comment

	for rows.Next() {

		var c models.Comment

		if err := rows.Scan(

			&c.ID, &c.PostID, &c.UserID, &c.Content, &c.IsEdited, &c.CreatedAt,

			&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.Bio,
		); err != nil {

			return nil, err

		}

		comments = append(comments, c)

	}

	return comments, nil

}

func (r *PostRepository) CreateComment(postID, userID int, content string) (*models.Comment, error) {

	var commentID int

	query := `INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id`

	err := r.db.QueryRow(query, postID, userID, content).Scan(&commentID)

	if err != nil {

		return nil, fmt.Errorf("create comment: %w", err)

	}

	queryComment := `

	SELECT 

		c.id, c.post_id, c.user_id, c.content, COALESCE(c.is_edited, FALSE), c.created_at,

		u.id, u.username, u.display_name, u.avatar_url, u.bio

	FROM comments c

	JOIN users u ON u.id = c.user_id

	WHERE c.id = $1

	`

	var c models.Comment

	err = r.db.QueryRow(queryComment, commentID).Scan(

		&c.ID, &c.PostID, &c.UserID, &c.Content, &c.IsEdited, &c.CreatedAt,

		&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.Bio,
	)

	if err != nil {

		return nil, err

	}

	_, _ = r.db.Exec("UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1", postID)

	return &c, nil

}

func (r *PostRepository) GetCommentByID(commentID int) (*models.Comment, error) {

	query := `

	SELECT 

		c.id, c.post_id, c.user_id, c.content, COALESCE(c.is_edited, FALSE), c.created_at,

		u.id, u.username, u.display_name, u.avatar_url, u.bio

	FROM comments c

	JOIN users u ON u.id = c.user_id

	WHERE c.id = $1

	`

	var c models.Comment

	err := r.db.QueryRow(query, commentID).Scan(

		&c.ID, &c.PostID, &c.UserID, &c.Content, &c.IsEdited, &c.CreatedAt,

		&c.User.ID, &c.User.Username, &c.User.DisplayName, &c.User.AvatarURL, &c.User.Bio,
	)

	if err != nil {

		return nil, err

	}

	return &c, nil

}

func (r *PostRepository) UpdateComment(commentID, userID int, content string) (*models.Comment, error) {

	query := `

	UPDATE comments

	SET content = $1, is_edited = TRUE, updated_at = NOW()

	WHERE id = $2 AND user_id = $3

	`

	res, err := r.db.Exec(query, content, commentID, userID)

	if err != nil {

		return nil, fmt.Errorf("update comment: %w", err)

	}

	rows, _ := res.RowsAffected()

	if rows == 0 {

		return nil, fmt.Errorf("комментарий не найден или нет прав на редактирование")

	}

	return r.GetCommentByID(commentID)

}

func (r *PostRepository) DeleteComment(commentID, userID int) (int, error) {

	var postID int

	query := `

	WITH deleted AS (

		DELETE FROM comments c

		USING posts p

		WHERE c.id = $1 AND c.post_id = p.id AND (c.user_id = $2 OR p.user_id = $2)

		RETURNING c.post_id

	)

	SELECT post_id FROM deleted;

	`

	err := r.db.QueryRow(query, commentID, userID).Scan(&postID)

	if err != nil {

		if err == sql.ErrNoRows {

			return 0, fmt.Errorf("комментарий не найден или нет прав на удаление")

		}

		return 0, fmt.Errorf("delete comment: %w", err)

	}

	_, _ = r.db.Exec("UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1", postID)

	return postID, nil

}

func (r *PostRepository) DeletePost(postID, userID int) error {

	query := `DELETE FROM posts WHERE id = $1 AND user_id = $2`

	res, err := r.db.Exec(query, postID, userID)

	if err != nil {

		return fmt.Errorf("delete post: %w", err)

	}

	rows, err := res.RowsAffected()

	if err != nil {

		return err

	}

	if rows == 0 {

		return fmt.Errorf("post not found or unauthorized")

	}

	return nil

}


func (r *PostRepository) attachPollsToPosts(posts []models.Post, currentUserID int) {
	if len(posts) == 0 {
		return
	}
	var pollIDs []int
	for _, p := range posts {
		if p.PollID != nil && *p.PollID > 0 {
			pollIDs = append(pollIDs, *p.PollID)
		}
	}
	if len(pollIDs) == 0 {
		return
	}

	rows, err := r.db.Query(`
		SELECT id, creator_id, question, is_multiple, is_anonymous, total_votes, created_at
		FROM polls WHERE id = ANY($1)
	`, pq.Array(pollIDs))
	if err != nil {
		return
	}
	defer rows.Close()

	pollsMap := make(map[int]*models.Poll)
	for rows.Next() {
		var poll models.Poll
		if err := rows.Scan(&poll.ID, &poll.CreatorID, &poll.Question, &poll.IsMultiple, &poll.IsAnonymous, &poll.TotalVotes, &poll.CreatedAt); err == nil {
			poll.Options = make([]models.PollOption, 0)
			poll.UserVotedOptionIDs = make([]int, 0)
			pollsMap[poll.ID] = &poll
		}
	}

	optRows, err := r.db.Query(`
		SELECT id, poll_id, text, votes_count
		FROM poll_options WHERE poll_id = ANY($1)
		ORDER BY id ASC
	`, pq.Array(pollIDs))
	if err == nil {
		defer optRows.Close()
		for optRows.Next() {
			var opt models.PollOption
			if err := optRows.Scan(&opt.ID, &opt.PollID, &opt.Text, &opt.VotesCount); err == nil {
				if poll, ok := pollsMap[opt.PollID]; ok {
					poll.Options = append(poll.Options, opt)
				}
			}
		}
	}

	if currentUserID > 0 {
		vRows, err := r.db.Query(`
			SELECT poll_id, option_id
			FROM poll_votes WHERE poll_id = ANY($1) AND user_id = $2
		`, pq.Array(pollIDs), currentUserID)
		if err == nil {
			defer vRows.Close()
			for vRows.Next() {
				var pID, oID int
				if err := vRows.Scan(&pID, &oID); err == nil {
					if poll, ok := pollsMap[pID]; ok {
						poll.UserVotedOptionIDs = append(poll.UserVotedOptionIDs, oID)
						poll.HasVoted = true
						for i := range poll.Options {
							if poll.Options[i].ID == oID {
								poll.Options[i].IsVoted = true
							}
						}
					}
				}
			}
		}
	}

	for _, poll := range pollsMap {
		for i := range poll.Options {
			opt := &poll.Options[i]
			if poll.TotalVotes > 0 {
				opt.Percentage = math.Round((float64(opt.VotesCount) / float64(poll.TotalVotes)) * 100)
			} else {
				opt.Percentage = 0
			}
		}
	}

	for i := range posts {
		if posts[i].PollID != nil {
			if poll, ok := pollsMap[*posts[i].PollID]; ok {
				posts[i].Poll = poll
			}
		}
	}
}

func (r *PostRepository) GetChannelPosts(channelID, currentUserID int, limit, offset int) ([]models.Post, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	query := `
	SELECT 
		p.id, p.user_id, p.content, COALESCE(p.image_url, ''), COALESCE(p.music_url, ''), COALESCE(p.music_title, ''), COALESCE(p.music_artist, ''), COALESCE(p.is_edited, FALSE), p.created_at, COALESCE(p.updated_at, p.created_at),
		p.channel_id, p.poll_id,
		u.id, u.username, u.display_name, u.avatar_url, u.bio,
		COALESCE(p.likes_count, 0) as likes_count,
		COALESCE(p.comments_count, 0) as comments_count,
		EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) as is_liked,
		ch.id, COALESCE(ch.name, ''), COALESCE(ch.handle, ''), COALESCE(ch.avatar_url, ''), COALESCE(ch.subscribers_count, 0)
	FROM posts p
	JOIN users u ON u.id = p.user_id
	LEFT JOIN channels ch ON ch.id = p.channel_id
	WHERE p.channel_id = $2
	ORDER BY p.created_at DESC
	LIMIT $3 OFFSET $4
	`

	rows, err := r.db.Query(query, currentUserID, channelID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("query channel posts: %w", err)
	}
	defer rows.Close()

	var posts []models.Post
	var postIDs []int

	for rows.Next() {
		var p models.Post
		var chID sql.NullInt64
		var chName, chHandle, chAvatar sql.NullString
		var chSubs sql.NullInt64

		if err := rows.Scan(
			&p.ID, &p.UserID, &p.Content, &p.ImageURL, &p.MusicURL, &p.MusicTitle, &p.MusicArtist, &p.IsEdited, &p.CreatedAt, &p.UpdatedAt,
			&p.ChannelID, &p.PollID,
			&p.User.ID, &p.User.Username, &p.User.DisplayName, &p.User.AvatarURL, &p.User.Bio,
			&p.LikesCount, &p.CommentsCount, &p.IsLiked,
			&chID, &chName, &chHandle, &chAvatar, &chSubs,
		); err != nil {
			return nil, fmt.Errorf("scan channel post: %w", err)
		}

		if chID.Valid {
			cID := int(chID.Int64)
			p.Channel = &models.Channel{
				ID:               cID,
				Name:             chName.String,
				Handle:           chHandle.String,
				AvatarURL:        chAvatar.String,
				SubscribersCount: int(chSubs.Int64),
			}
		}

		p.Comments = []models.Comment{}
		posts = append(posts, p)
		postIDs = append(postIDs, p.ID)
	}

	if len(postIDs) > 0 {
		commentsMap, err := r.GetCommentsByPostIDs(postIDs)
		if err == nil {
			for i := range posts {
				if cmts, ok := commentsMap[posts[i].ID]; ok {
					posts[i].Comments = cmts
					if len(cmts) > posts[i].CommentsCount {
						posts[i].CommentsCount = len(cmts)
					}
				}
			}
		}
	}

	r.attachPollsToPosts(posts, currentUserID)
	return posts, nil
}
