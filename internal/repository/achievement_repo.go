package repository

import (
	"database/sql"
	"fmt"
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
	for rows.Next() {
		var a models.Achievement
		if err := rows.Scan(
			&a.ID, &a.Title, &a.Description, &a.Category,
			&a.Rarity, &a.Icon, &a.Points, &a.TargetCount, &a.SortOrder,
		); err != nil {
			return nil, fmt.Errorf("scan achievement: %w", err)
		}
		achievements = append(achievements, a)
	}

	// 2. Fetch existing unlocked status from database
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

	// 3. Compute live user metrics
	var (
		postsCount           int
		postsPhotoCount      int
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
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM comments WHERE user_id = $1`, userID).Scan(&commentsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM follows WHERE follower_id = $1`, userID).Scan(&followsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM follows WHERE following_id = $1`, userID).Scan(&followersCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM likes WHERE user_id = $1`, userID).Scan(&likesGivenCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM likes l JOIN posts p ON l.post_id = p.id WHERE p.user_id = $1`, userID).Scan(&likesReceivedCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM poll_votes WHERE user_id = $1`, userID).Scan(&pollVotesCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts WHERE user_id = $1 AND poll_question IS NOT NULL AND poll_question != ''`, userID).Scan(&pollsCreatedCount)
	_ = r.db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM users 
			WHERE id = $1 AND (
				avatar_frame != 'default' OR profile_bg_effect != 'none' OR status_text != '' OR accent_color != '#00f0ff'
			)
		)`, userID).Scan(&hasProfileCustom)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM user_music WHERE user_id = $1`, userID).Scan(&profileMusicCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM channel_subscribers WHERE user_id = $1`, userID).Scan(&channelSubsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM gifts WHERE sender_id = $1`, userID).Scan(&giftsSentCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM gifts WHERE receiver_id = $1`, userID).Scan(&giftsReceivedCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE sender_id = $1 AND receiver_channel_id IS NOT NULL`, userID).Scan(&channelDMsCount)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM channels WHERE owner_id = $1`, userID).Scan(&channelsCreatedCount)
	_ = r.db.QueryRow(`
		SELECT COALESCE(MAX(sub_cnt), 0) FROM (
			SELECT COUNT(*) as sub_cnt FROM channel_subscribers cs 
			JOIN channels c ON cs.channel_id = c.id 
			WHERE c.owner_id = $1 GROUP BY c.id
		) t`, userID).Scan(&maxChannelSubs)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM posts p JOIN channels c ON p.channel_id = c.id WHERE c.owner_id = $1`, userID).Scan(&channelPostsCount)

	now := time.Now()
	var newUnlocked []models.Achievement
	totalPointsPossible := 0

	// 4. First Pass: evaluate regular achievements
	for i := range achievements {
		a := &achievements[i]
		totalPointsPossible += a.Points

		var currentVal int
		switch a.ID {
		case "posts_3":
			currentVal = postsCount
		case "posts_photo_3":
			currentVal = postsPhotoCount
		case "comments_5":
			currentVal = commentsCount
		case "give_likes_15":
			currentVal = likesGivenCount
		case "likes_received_10":
			currentVal = likesReceivedCount
		case "follows_3":
			currentVal = followsCount
		case "followers_3":
			currentVal = followersCount
		case "vote_poll_3":
			currentVal = pollVotesCount
		case "create_polls_2":
			currentVal = pollsCreatedCount
		case "profile_custom":
			if hasProfileCustom {
				currentVal = 1
			} else {
				currentVal = 0
			}
		case "profile_music_3":
			currentVal = profileMusicCount
		case "sub_channels_3":
			currentVal = channelSubsCount
		case "send_gifts_2":
			currentVal = giftsSentCount
		case "gifts_received_2":
			currentVal = giftsReceivedCount
		case "channel_dm_3":
			currentVal = channelDMsCount
		case "posts_25":
			currentVal = postsCount
		case "comments_30":
			currentVal = commentsCount
		case "give_likes_60":
			currentVal = likesGivenCount
		case "likes_received_40":
			currentVal = likesReceivedCount
		case "follows_15":
			currentVal = followsCount
		case "followers_10":
			currentVal = followersCount
		case "create_channel_1":
			currentVal = channelsCreatedCount
		case "channel_subs_10":
			currentVal = maxChannelSubs
		case "channel_posts_10":
			currentVal = channelPostsCount
		case "vote_poll_12":
			currentVal = pollVotesCount
		case "create_polls_8":
			currentVal = pollsCreatedCount
		case "send_gifts_6":
			currentVal = giftsSentCount
		case "gifts_received_6":
			currentVal = giftsReceivedCount
		case "profile_music_8":
			currentVal = profileMusicCount
		case "posts_75":
			currentVal = postsCount
		case "comments_100":
			currentVal = commentsCount
		case "likes_received_100":
			currentVal = likesReceivedCount
		case "channel_subs_25":
			currentVal = maxChannelSubs
		case "gifts_received_15":
			currentVal = giftsReceivedCount
		case "send_gifts_15":
			currentVal = giftsSentCount
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

	// 5. Calculate preliminary points and unlocked count for Second Pass
	calcUnlockedCount := 0
	calcTotalXP := 0
	for _, a := range achievements {
		if a.IsUnlocked {
			calcUnlockedCount++
			calcTotalXP += a.Points
		}
	}

	prelimLevel := models.CalculateLevel(calcTotalXP)

	// 6. Second Pass: evaluate level and veteran meta achievements
	for i := range achievements {
		a := &achievements[i]
		switch a.ID {
		case "level_4_reach":
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
		case "level_6_reach":
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
		case "level_8_reach":
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
		case "level_10_reach":
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
		case "veteran_achievements_20":
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

	// 7. Persist updated user XP & account_level in DB
	_, _ = r.db.Exec(`
		UPDATE users 
		SET experience_points = $1, account_level = $2 
		WHERE id = $3
	`, finalTotalXP, userLevel.Level, userID)

	// 8. Persist user_achievements records
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

	// 9. Load target user info
	var targetUser models.User
	_ = r.db.QueryRow(`
		SELECT id, username, display_name, avatar_url, bio, experience_points, account_level
		FROM users WHERE id = $1
	`, userID).Scan(
		&targetUser.ID, &targetUser.Username, &targetUser.DisplayName,
		&targetUser.AvatarURL, &targetUser.Bio,
		&targetUser.ExperiencePoints, &targetUser.AccountLevel,
	)
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
