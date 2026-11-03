package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

func main() {
	connStr := "host=localhost port=1357 user=postgres password=root111 dbname=gosocial sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error connecting: %v", err)
	}
	defer db.Close()

	// 1. Update any old gift types in gifts table
	updates := map[string]string{
		"festive_box":      "cyber_katana",
		"bear_heart":       "samurai_helmet",
		"cute_kitten":      "synthwave_cassette",
		"gentle_bouquet":   "mantis_blade",
		"cozy_cup":         "combat_stim",
		"cyber_heart":      "quantum_heart",
		"cyber_skull":      "samurai_helmet",
		"black_ice":        "cyber_katana",
		"cyber_drone":      "tactical_drone",
		"neuro_stimulator": "combat_stim",
	}

	for oldT, newT := range updates {
		res, err := db.Exec("UPDATE gifts SET gift_type = $1 WHERE gift_type = $2", newT, oldT)
		if err != nil {
			log.Printf("Error updating %s -> %s: %v", oldT, newT, err)
		} else {
			n, _ := res.RowsAffected()
			if n > 0 {
				fmt.Printf("Updated %d gifts: %s -> %s\n", n, oldT, newT)
			}
		}
	}

	// 2. Ensure each of the 9 gifts exists at least once in the showcase for demonstration!
	sampleGifts := []struct {
		SenderID   int
		ReceiverID int
		GiftType   string
		Message    string
	}{
		{2, 1, "cyber_katana", "Легендарная Кибер-Катана с лазерным лезвием! 🗡️⚡"},
		{3, 1, "neuro_visor", "Нейро-Визор HUD для полного контроля киберпространства! 👓🔍"},
		{2, 1, "quantum_heart", "Квантовое Кибер-Сердце с термоядерным пульсом! 💖⚡"},
		{1, 2, "samurai_helmet", "Боевой Шлем Самурая Oni с LED-рогами! 🛡️👹"},
		{1, 3, "synthwave_cassette", "Синтвейв Нейро-Кассета с ретро-эквалайзером! 📼🎶"},
		{2, 3, "mantis_blade", "Клинок Богомола с термо-лезвием! 🗡️🔥"},
		{3, 2, "tactical_drone", "Тактический Кибер-Дрон с круговым радаром! 🛸📡"},
		{1, 2, "emp_grenade", "Плазменная ЭМИ-Граната со сферическими дугами! 💣⚡"},
		{3, 1, "combat_stim", "Нейро-Инжектор «MaxDoc» с целебной нано-сывороткой! 💉🧪"},
	}

	for _, g := range sampleGifts {
		var exists bool
		_ = db.QueryRow("SELECT EXISTS(SELECT 1 FROM gifts WHERE gift_type = $1)", g.GiftType).Scan(&exists)
		if !exists {
			_, err = db.Exec("INSERT INTO gifts (sender_id, receiver_id, gift_type, message, created_at) VALUES ($1, $2, $3, $4, NOW())",
				g.SenderID, g.ReceiverID, g.GiftType, g.Message)
			if err == nil {
				fmt.Printf("Seeded sample gift for showcase: %s\n", g.GiftType)
			}
		}
	}

	// 3. Print all gifts now in database
	rows, err := db.Query("SELECT id, sender_id, receiver_id, gift_type, message FROM gifts ORDER BY id DESC LIMIT 20")
	if err != nil {
		log.Fatalf("Query gifts: %v", err)
	}
	defer rows.Close()

	fmt.Println("\nCurrent gifts in database:")
	for rows.Next() {
		var id int
		var sid, rid sql.NullInt64
		var gtype, msg string
		rows.Scan(&id, &sid, &rid, &gtype, &msg)
		fmt.Printf("ID %d | Type: %s | Msg: %s\n", id, gtype, msg)
	}
}
