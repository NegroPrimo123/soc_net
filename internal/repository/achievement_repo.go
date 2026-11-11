package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"social-network/internal/models"
)

type AchievementRepository struct {
	db *sql.DB
}

func NewAchievementRepository(db *sql.DB) *AchievementRepository {
	return &AchievementRepository{db: db}
}

// GetAchievements evaluates all user activities, unlocks achievements, updates user XP & Level,
// and returns full achievement list, level information, and target user profile.
func (r *AchievementRepository) GetAchievements(userID int) (*models.UserAchievementsResponse, error) {
	// 1. Fetch all system achievements
	query := `
		SELECT id, title, description, category, rarity, icon, points, target_count, sort_order
		FROM achievements
		ORDER BY sort_order ASC, points ASC
	`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query achievements: %w", err)
	}
	defer rows.Close()

	var achievements []models.Achievement
	totalPointsPossible := 0
	for rows.Next() {
		var a models.Achievement
		if err := rows.Scan(
			&a.ID, &a.Title, &a.Description, &a.Category,
			&a.Rarity, &a.Icon, &a.Points, &a.TargetCount, &a.SortOrder,
		); err != nil {
			return nil, fmt.Errorf("scan achievement: %w", err)
		}
		achievements = append(achievements, a)
		totalPointsPossible += a.Points
	}

	// 2. Load target user info
	var targetUser models.User
	_ = r.db.QueryRow(`
		SELECT id, username, display_name, avatar_url, bio, experience_points, account_level
		FROM users WHERE id = $1
	`, userID).Scan(
		&targetUser.ID, &targetUser.Username, &targetUser.DisplayName,
		&targetUser.AvatarURL, &targetUser.Bio,
		&targetUser.ExperiencePoints, &targetUser.AccountLevel,
	)

	now := time.Now()
	var newUnlocked []models.Achievement

	// Special override for user "Итаква" (itakwa): 100% unlocked, Max level 10, all achievements completed
	isItakwa := userID == 9 ||
		strings.EqualFold(targetUser.Username, "itakwa") ||
		strings.EqualFold(targetUser.Username, "ithaqua") ||
		strings.EqualFold(targetUser.Username, "итаква")

	if isItakwa {
		for i := range achievements {
			a := &achievements[i]
			a.Progress = a.TargetCount
			a.IsUnlocked = true
			achTime := now
			a.UnlockedAt = &achTime
			_, _ = r.db.Exec(`
				INSERT INTO user_achievements (user_id, achievement_id, progress, is_unlocked, unlocked_at)
				VALUES ($1, $2, $3, TRUE, $4)
				ON CONFLICT (user_id, achievement_id) DO UPDATE SET
					progress = EXCLUDED.progress,
					is_unlocked = TRUE,
					unlocked_at = COALESCE(user_achievements.unlocked_at, EXCLUDED.unlocked_at)
			`, userID, a.ID, a.TargetCount, achTime)
		}

		userLevel := models.CalculateLevel(totalPointsPossible)
		userLevel.Level = 10
		userLevel.Title = "Легенда Найт-Сити"
		userLevel.ProgressPerc = 100

		_, _ = r.db.Exec(`
			UPDATE users 
			SET experience_points = $1, account_level = $2 
			WHERE id = $3
		`, totalPointsPossible, 10, userID)

		targetUser.ExperiencePoints = totalPointsPossible
		targetUser.AccountLevel = 10
		targetUser.LevelTitle = "Легенда Найт-Сити"

		return &models.UserAchievementsResponse{
			User:                &targetUser,
			UserLevel:           userLevel,
			TotalAchievements:   len(achievements),
			UnlockedCount:       len(achievements),
			TotalPointsEarned:   totalPointsPossible,
			TotalPointsPossible: totalPointsPossible,
			Achievements:        achievements,
			NewUnlocked:         newUnlocked,
		}, nil
	}

	// 3. For other users: Fetch existing unlocked status from database
	unlockedMap := make(map[string]time.Time)
	uaRows, err := r.db.Query(`
		SELECT achievement_id, unlocked_at 
		FROM user_achievements 
		WHERE user_id = $1 AND is_unlocked = TRUE
	`, userID)
	if err == nil {
		defer uaRows.Close()
		for uaRows.Next() {
			var achID string
			var uAt time.Time
			if err := uaRows.Scan(&achID, &uAt); err == nil {
				unlockedMap[achID] = uAt
			}
		}
	}

	// 4. Compute live user metrics
	var (
		postsCount           int
		postsPhotoCount      int
		postsMusicCount      int
		commentsCount        int
		followsCount         int
		followersCount       int
		likesGivenCount      int
		likesReceivedCount   int
		pollVotesCount       int
		pollsCreatedCount    int
		hasProfileCustom     bool
		profileMusicCount    int
		channelSubsCount     int
		giftsSentCount       int
		giftsReceivedCount   int
		channelDMsCount      int
		channelsCreatedCount int
		maxChannelSubs       int
		channelPostsCount    int
	)

	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts WHERE user_id = $1`, userID).Scan(&postsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts WHERE user_id = $1 AND image_url != ''`, userID).Scan(&postsPhotoCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts WHERE user_id = $1 AND music_url != ''`, userID).Scan(&postsMusicCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM comments WHERE user_id = $1`, userID).Scan(&commentsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = $1`, userID).Scan(&followsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM follows WHERE following_id = $1`, userID).Scan(&followersCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM likes WHERE user_id = $1`, userID).Scan(&likesGivenCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM likes l JOIN posts p ON l.post_id = p.id WHERE p.user_id = $1`, userID).Scan(&likesReceivedCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM poll_votes WHERE user_id = $1`, userID).Scan(&pollVotesCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts WHERE user_id = $1 AND poll_id IS NOT NULL`, userID).Scan(&pollsCreatedCount)
	_ = r.db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM users 
			WHERE id = $1 AND (
				avatar_frame != 'default' OR profile_bg_effect != 'none' OR status_text != '' OR accent_color != '#00f0ff'
			)
		)`, userID).Scan(&hasProfileCustom)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM user_music WHERE user_id = $1`, userID).Scan(&profileMusicCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM channel_members WHERE user_id = $1`, userID).Scan(&channelSubsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM gifts WHERE sender_id = $1`, userID).Scan(&giftsSentCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM gifts WHERE receiver_id = $1`, userID).Scan(&giftsReceivedCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE sender_id = $1 AND channel_id IS NOT NULL`, userID).Scan(&channelDMsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM channels WHERE creator_id = $1`, userID).Scan(&channelsCreatedCount)
	_ = r.db.QueryRow(`
		SELECT COALESCE(MAX(sub_cnt), 0) FROM (
			SELECT COUNT(*) as sub_cnt FROM channel_members cm 
			JOIN channels c ON cm.channel_id = c.id 
			WHERE c.creator_id = $1 GROUP BY c.id
		) t`, userID).Scan(&maxChannelSubs)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts p JOIN channels c ON p.channel_id = c.id WHERE c.creator_id = $1`, userID).Scan(&channelPostsCount)

	// 5. First Pass: evaluate regular achievements
	for i := range achievements {
		a := &achievements[i]

		var currentVal int
		switch a.ID {
		case "posts_5", "posts_35", "posts_100":
			currentVal = postsCount
		case "posts_photo_5", "posts_photo_15":
			currentVal = postsPhotoCount
		case "posts_music_3", "posts_music_10":
			currentVal = postsMusicCount
		case "comments_10", "comments_40", "comments_150":
			currentVal = commentsCount
		case "give_likes_25", "give_likes_80", "give_likes_200":
			currentVal = likesGivenCount
		case "likes_received_15", "likes_received_50", "likes_received_150":
			currentVal = likesReceivedCount
		case "follows_5", "follows_20":
			currentVal = followsCount
		case "followers_5", "followers_15", "followers_30":
			currentVal = followersCount
		case "vote_poll_5", "vote_poll_15":
			currentVal = pollVotesCount
		case "create_polls_3", "create_polls_10":
			currentVal = pollsCreatedCount
		case "profile_custom":
			if hasProfileCustom {
				currentVal = 1
			} else {
				currentVal = 0
			}
		case "profile_music_4", "profile_music_10":
			currentVal = profileMusicCount
		case "sub_channels_5", "sub_channels_10":
			currentVal = channelSubsCount
		case "send_gifts_3", "send_gifts_8", "send_gifts_20":
			currentVal = giftsSentCount
		case "gifts_received_3", "gifts_received_8", "gifts_received_20":
			currentVal = giftsReceivedCount
		case "channel_dm_5", "channel_dm_12":
			currentVal = channelDMsCount
		case "create_channel_1":
			currentVal = channelsCreatedCount
		case "channel_subs_12", "channel_subs_30":
			currentVal = maxChannelSubs
		case "channel_posts_15":
			currentVal = channelPostsCount
		default:
			// level tiers and veteran achievements evaluated in Second Pass
			continue
		}

		a.Progress = currentVal
		if a.Progress > a.TargetCount {
			a.Progress = a.TargetCount
		}

		if prevTime, ok := unlockedMap[a.ID]; ok {
			a.IsUnlocked = true
			a.UnlockedAt = &prevTime
		} else if a.Progress >= a.TargetCount {
			a.IsUnlocked = true
			a.UnlockedAt = &now
			unlockedMap[a.ID] = now
			newUnlocked = append(newUnlocked, *a)
		}
	}

	// 6. Calculate preliminary points and unlocked count for Second Pass
	calcUnlockedCount := 0
	calcTotalXP := 0
	for _, a := range achievements {
		if a.IsUnlocked {
			calcUnlockedCount++
			calcTotalXP += a.Points
		}
	}

	prelimLevel := models.CalculateLevel(calcTotalXP)

	// 7. Second Pass: evaluate level and veteran meta achievements
	for i := range achievements {
		a := &achievements[i]
		switch a.ID {
		case "level_2_reach", "level_4_reach", "level_6_reach", "level_8_reach", "level_10_reach":
			a.Progress = prelimLevel.Level
			if a.Progress > a.TargetCount {
				a.Progress = a.TargetCount
			}
			if prevTime, ok := unlockedMap[a.ID]; ok {
				a.IsUnlocked = true
				a.UnlockedAt = &prevTime
			} else if a.Progress >= a.TargetCount {
				a.IsUnlocked = true
				a.UnlockedAt = &now
				unlockedMap[a.ID] = now
				newUnlocked = append(newUnlocked, *a)
				calcTotalXP += a.Points
				calcUnlockedCount++
			}
		case "veteran_achievements_15", "veteran_achievements_25", "veteran_achievements_40":
			a.Progress = calcUnlockedCount
			if a.Progress > a.TargetCount {
				a.Progress = a.TargetCount
			}
			if prevTime, ok := unlockedMap[a.ID]; ok {
				a.IsUnlocked = true
				a.UnlockedAt = &prevTime
			} else if a.Progress >= a.TargetCount {
				a.IsUnlocked = true
				a.UnlockedAt = &now
				unlockedMap[a.ID] = now
				newUnlocked = append(newUnlocked, *a)
				calcTotalXP += a.Points
				calcUnlockedCount++
			}
		}
	}

	// Recalculate final XP & Level
	finalTotalXP := 0
	finalUnlockedCount := 0
	for _, a := range achievements {
		if a.IsUnlocked {
			finalTotalXP += a.Points
			finalUnlockedCount++
		}
	}

	userLevel := models.CalculateLevel(finalTotalXP)

	// 8. Persist updated user XP & account_level in DB
	_, _ = r.db.Exec(`
		UPDATE users 
		SET experience_points = $1, account_level = $2 
		WHERE id = $3
	`, finalTotalXP, userLevel.Level, userID)

	// 9. Persist user_achievements records
	for _, a := range achievements {
		var unlockedAtVal *time.Time
		if a.IsUnlocked {
			unlockedAtVal = a.UnlockedAt
		}
		_, _ = r.db.Exec(`
			INSERT INTO user_achievements (user_id, achievement_id, progress, is_unlocked, unlocked_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, achievement_id) DO UPDATE SET
				progress = EXCLUDED.progress,
				is_unlocked = EXCLUDED.is_unlocked,
				unlocked_at = COALESCE(user_achievements.unlocked_at, EXCLUDED.unlocked_at)
		`, userID, a.ID, a.Progress, a.IsUnlocked, unlockedAtVal)
	}

	targetUser.ExperiencePoints = finalTotalXP
	targetUser.AccountLevel = userLevel.Level
	targetUser.LevelTitle = userLevel.Title

	return &models.UserAchievementsResponse{
		User:                &targetUser,
		UserLevel:           userLevel,
		TotalAchievements:   len(achievements),
		UnlockedCount:       finalUnlockedCount,
		TotalPointsEarned:   finalTotalXP,
		TotalPointsPossible: totalPointsPossible,
		Achievements:        achievements,
		NewUnlocked:         newUnlocked,
	}, nil
}
