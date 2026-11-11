package main

import (
	"fmt"
	"log"
	"net/http"

	"social-network/internal/config"
	"social-network/internal/database"
	"social-network/internal/events"
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
	giftRepo := repository.NewGiftRepository(db)
	messageRepo := repository.NewMessageRepository(db)
	notifRepo := repository.NewNotificationRepository(db)
	channelRepo := repository.NewChannelRepository(db)
	pollRepo := repository.NewPollRepository(db)
	achievementRepo := repository.NewAchievementRepository(db)

	// Инициализация и запуск Real-time SSE Hub (паттерн Hub/Subscriber)
	hub := events.NewHub()
	go hub.Run()

	h, err := handlers.NewHandler(userRepo, postRepo, giftRepo, messageRepo, notifRepo, channelRepo, pollRepo, achievementRepo, hub)
	if err != nil {
		log.Fatalf("Fatal: Handler initialization error: %v", err)
	}

	mux := http.NewServeMux()
	handlers.RegisterRoutes(mux, h)

	// Wrap root router with GZIP compression, HTTP Cache-Control and Security Headers
	handler := handlers.ApplyMiddleware(mux)

	serverAddr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Println("==================================================")
	fmt.Println("🚀 GoSocial Backend & Web UI is running!")
	fmt.Printf("🌐 Open in browser: http://localhost:%s\n", cfg.Port)
	fmt.Println("🗄️  Database: PostgreSQL (gosocial)")
	fmt.Println("==================================================")

	if err := http.ListenAndServe(serverAddr, handler); err != nil {
		log.Fatalf("Fatal: Server stopped: %v", err)
	}
}
