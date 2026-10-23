package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	connStr := "host=localhost port=5432 user=postgres password=12345 dbname=gosocial sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error connecting: %v", err)
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Error hashing: %v", err)
	}

	// Update all existing demo users to have password 'password123'
	res, err := db.Exec("UPDATE users SET password_hash = $1 WHERE password_hash IS NULL OR password_hash = '' OR username IN ('oleg', 'alex', 'sophia', 'dmitry')", string(hash))
	if err != nil {
		log.Fatalf("Error updating passwords: %v", err)
	}
	n, _ := res.RowsAffected()
	fmt.Printf("Updated %d users with password 'password123'\n", n)

	// Ensure dmitry has correct display name
	_, err = db.Exec("UPDATE users SET display_name = 'Дмитрий Смирнов' WHERE username = 'dmitry'")
	if err != nil {
		log.Printf("Error updating dmitry: %v", err)
	}

	rows, err := db.Query("SELECT id, username, display_name, (password_hash != '') as has_pw FROM users ORDER BY id")
	if err != nil {
		log.Fatalf("Error querying users: %v", err)
	}
	defer rows.Close()

	fmt.Println("Users status:")
	for rows.Next() {
		var id int
		var username, displayName string
		var hasPw bool
		rows.Scan(&id, &username, &displayName, &hasPw)
		fmt.Printf("ID: %d | Username: %s | DisplayName: %s | HasPassword: %v\n", id, username, displayName, hasPw)
	}
}
