package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"social-network/internal/config"
	"social-network/internal/database"
	"social-network/internal/events"
	"social-network/internal/federation"
	"social-network/internal/graph"
	"social-network/internal/handlers"
	"social-network/internal/ranking"
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
	cryptoRepo := repository.NewCryptoRepository(db)
	federationRepo := repository.NewFederationRepository(db)

	// Инициализация Social Graph Engine
	socialGraph := graph.NewGraph()
	if err := socialGraph.BuildFromDB(db); err != nil {
		log.Printf("[SocialGraph] Предупреждение: %v", err)
	}

	// Инициализация рекомендательного ранжирующего движка контента
	rankingEngine := ranking.NewEngine(socialGraph)

	// Инициализация сервиса федерации узлов
	federationSvc := federation.NewService("NeoNet Hub Alpha", fmt.Sprintf("http://localhost:%s", cfg.Port))

	// Инициализация и запуск Real-time SSE Hub (паттерн Hub/Subscriber)
	hub := events.NewHub()
	go hub.Run()

	h, err := handlers.NewHandler(
		userRepo,
		postRepo,
		giftRepo,
		messageRepo,
		notifRepo,
		channelRepo,
		pollRepo,
		achievementRepo,
		cryptoRepo,
		federationRepo,
		socialGraph,
		rankingEngine,
		federationSvc,
		hub,
	)
	if err != nil {
		log.Fatalf("Fatal: Handler initialization error: %v", err)
	}

	// Подключение к gRPC микросервису графа и ранжирования при его наличии
	grpcAddr := os.Getenv("GRAPH_SERVICE_ADDR")
	if grpcAddr == "" {
		grpcAddr = "localhost:50051"
	}
	if remoteClient, err := graph.NewRemoteClient(grpcAddr); err == nil {
		h.SetRemoteGraphClient(remoteClient)
		defer remoteClient.Close()
		log.Printf("[Microservice Architecture] API Gateway подключен к gRPC Graph & Ranking Service (%s)", grpcAddr)
	} else {
		log.Printf("[Microservice Architecture] gRPC микросервис не обнаружен, используется локальный in-process движок (fallback: %v)", err)
	}

	mux := http.NewServeMux()
	handlers.RegisterRoutes(mux, h)

	// Wrap root router with GZIP compression, HTTP Cache-Control and Security Headers
	handler := handlers.ApplyMiddleware(mux)

	serverAddr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Println("==================================================")
	fmt.Println("🚀 GoSocial Decentralized Core & Web UI is running!")
	fmt.Printf("🌐 Open in browser: http://localhost:%s\n", cfg.Port)
	fmt.Println("🗄️  Database: PostgreSQL (gosocial)")
	fmt.Println("🕸️  Social Graph Engine: Initialized (PageRank + BFS)")
	fmt.Println("⚡ Content Ranking Engine: Active (Smart Multi-factor Feed)")
	fmt.Println("🔐 Cryptographic Protocol: Ed25519 & X25519 E2EE Enabled")
	fmt.Println("🌐 Federation Protocol: Active (Peer Discovery & Signed Sync)")
	fmt.Println("==================================================")

	if err := http.ListenAndServe(serverAddr, handler); err != nil {
		log.Fatalf("Fatal: Server stopped: %v", err)
	}
}
