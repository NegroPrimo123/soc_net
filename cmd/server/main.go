package main

import (
	"fmt"
	"log"
	"net/http"

	"social-network/internal/config"
	"social-network/internal/database"
	"social-network/internal/handlers"
	"social-network/internal/repository"
)

func main() {
	cfg := config.Load()

	log.Printf("Connecting to PostgreSQL at %s:%s (DB: %s)...", cfg.DBHost, cfg.DBPort, cfg.DBName)
	db, err := database.InitDB(cfg)
	if err != nil {
		log.Fatalf("Fatal: Database initialization error: %v", err)
	}
	defer db.Close()

	userRepo := repository.NewUserRepository(db)
	postRepo := repository.NewPostRepository(db)

	h, err := handlers.NewHandler(userRepo, postRepo)
	if err != nil {
		log.Fatalf("Fatal: Handler initialization error: %v", err)
	}

	mux := http.NewServeMux()
	handlers.RegisterRoutes(mux, h)

	serverAddr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Println("==================================================")
	fmt.Println("🚀 GoSocial Backend & Web UI is running!")
	fmt.Printf("🌐 Open in browser: http://localhost:%s\n", cfg.Port)
	fmt.Println("🗄️  Database: PostgreSQL (gosocial)")
	fmt.Println("==================================================")

	if err := http.ListenAndServe(serverAddr, mux); err != nil {
		log.Fatalf("Fatal: Server stopped: %v", err)
	}
}
