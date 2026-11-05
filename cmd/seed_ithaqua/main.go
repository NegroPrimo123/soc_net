package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	connStr := "host=localhost port=1357 user=postgres password=root111 dbname=gosocial sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error connecting: %v", err)
	}
	defer db.Close()

	// Hash password "123123"
	hash, err := bcrypt.GenerateFromPassword([]byte("123123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Error hashing: %v", err)
	}

	avatarURL := "/uploads/ithaqua_1fb3a18e3859fc2e3465550920a07806.jpg"
	bannerURL := "/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg"
	bio := "Ночной Дозорный (Night Watch) • Охотник Поместья Олетис (Identity V). Владыка ледяных ветров и безжалостных метелей. Тот, кто бесшумно шагает сквозь свирепую зимнюю бурю на острых ходулях, ведомый плачем замерзшей матери. «Тише... слышишь, как завывает северный ветер?»"
	statusText := "❄️ Метель уже близко... Я слышу твой шаг."
	statusEmoji := "❄️"
	customRank := "Ледяной Страж • Ночной Дозорный (Identity V)"
	accentColor := "#38bdf8"
	avatarFrame := "night-watch"
	profileBgEffect := "arctic-blizzard"
	skillsTags := "Identity V, Охотник, Ночной Дозорный, Поступь Ветра, Циклон, Метель, Олетис"
	socialLinks := `{"web":"https://idv.163.com","discord":"Ithaqua#0001"}`

	// Upsert user 'itakwa'
	var userID int
	err = db.QueryRow("SELECT id FROM users WHERE LOWER(username) = 'itakwa'").Scan(&userID)
	if err == sql.ErrNoRows {
		insertQuery := `
		INSERT INTO users (
			username, display_name, password_hash, avatar_url, banner_url, bio,
			status_text, status_emoji, custom_rank, accent_color, avatar_frame,
			profile_bg_effect, skills_tags, social_links, pinned_gift_id
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		) RETURNING id`
		err = db.QueryRow(
			insertQuery,
			"itakwa", "Итаква • Night Watch", string(hash), avatarURL, bannerURL, bio,
			statusText, statusEmoji, customRank, accentColor, avatarFrame,
			profileBgEffect, skillsTags, socialLinks, 1,
		).Scan(&userID)
		if err != nil {
			log.Fatalf("Error inserting itakwa user: %v", err)
		}
		fmt.Printf("Created user 'itakwa' with ID %d\n", userID)
	} else if err != nil {
		log.Fatalf("Error querying user: %v", err)
	} else {
		updateQuery := `
		UPDATE users SET
			display_name = $1, password_hash = $2, avatar_url = $3, banner_url = $4, bio = $5,
			status_text = $6, status_emoji = $7, custom_rank = $8, accent_color = $9, avatar_frame = $10,
			profile_bg_effect = $11, skills_tags = $12, social_links = $13, pinned_gift_id = $14
		WHERE id = $15`
		_, err = db.Exec(
			updateQuery,
			"Итаква • Night Watch", string(hash), avatarURL, bannerURL, bio,
			statusText, statusEmoji, customRank, accentColor, avatarFrame,
			profileBgEffect, skillsTags, socialLinks, 1,
			userID,
		)
		if err != nil {
			log.Fatalf("Error updating user: %v", err)
		}
		fmt.Printf("Updated user 'itakwa' (ID %d)\n", userID)
	}

	// Delete old seed posts from itakwa if re-running
	_, _ = db.Exec("DELETE FROM posts WHERE user_id = $1", userID)

	// Seed 3 posts for itakwa
	posts := []struct {
		content  string
		imageURL string
		interval string
	}{
		{
			content:  "«Ветер стихает лишь тогда, когда жертва падает на колени... Острые лезвия ходуль скользят по заледеневшей земле, а метель за спиной стирает всякую надежду на спасение из поместья Олетис. Готовы ли вы встретить бурю лицом к лицу?» ❄️🌪️ #IdentityV #NightWatch #Итаква",
			imageURL: "/uploads/ithaqua_f292c2602f0f8c85327e7e458b25d116.jpg",
			interval: "4 hours",
		},
		{
			content:  "«Солнечный диск обманчив среди вечных снегов. Даже под золотым одеянием моё дыхание остаётся стужей. Скоро в морозном тумане прозвучит зов колокола.» 🕯️❄️ #IdentityV #Ithaqua #IdentityVHunters",
			imageURL: "/uploads/ithaqua_ff8cc7d545cedab20da705892775673c.jpg",
			interval: "2 hours",
		},
		{
			content:  "«Без маски холод ощущается иначе. Те, кто предали нас в морозной ночи, давно обратились в прах, а ветер продолжает шептать их имена...» 🌨️⚔️ #IdentityV #Итаква",
			imageURL: "/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg",
			interval: "30 minutes",
		},
	}

	for _, p := range posts {
		q := fmt.Sprintf(`
		INSERT INTO posts (user_id, content, image_url, likes_count, comments_count, created_at)
		VALUES ($1, $2, $3, 5, 2, NOW() - INTERVAL '%s')`, p.interval)
		_, err = db.Exec(q, userID, p.content, p.imageURL)
		if err != nil {
			log.Printf("Error inserting post: %v", err)
		}
	}
	fmt.Printf("Inserted %d posts for user 'itakwa'\n", len(posts))

	// Also make some follows so the profile looks lively
	_, _ = db.Exec("INSERT INTO follows (follower_id, following_id) VALUES (1, $1), (2, $1), (3, $1) ON CONFLICT DO NOTHING", userID)
	_, _ = db.Exec("INSERT INTO follows (follower_id, following_id) VALUES ($1, 1) ON CONFLICT DO NOTHING", userID)

	// Send a gift to itakwa
	_, _ = db.Exec(`
		INSERT INTO gifts (sender_id, receiver_id, gift_type, message, is_anonymous, created_at)
		VALUES (1, $1, 'cyber_katana', 'Подарок ледяному охотнику за мастерство охоты в метели! 🗡️❄️', false, NOW() - INTERVAL '1 hour')
		ON CONFLICT DO NOTHING`, userID)

	fmt.Println("Seeding completed successfully!")
}
