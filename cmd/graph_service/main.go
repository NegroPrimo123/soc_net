package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"social-network/internal/config"
	"social-network/internal/database"
	"social-network/internal/graph"
	"social-network/internal/models"
	"social-network/internal/ranking"
	pb "social-network/proto/graphranking"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// server implements pb.GraphRankingServiceServer
type server struct {
	pb.UnimplementedGraphRankingServiceServer
	socialGraph   *graph.Graph
	rankingEngine *ranking.Engine
}

func (s *server) GetTopology(ctx context.Context, req *pb.TopologyRequest) (*pb.TopologyResponse, error) {
	depth := int(req.GetDepth())
	if depth <= 0 {
		depth = 25
	}
	centerID := int(req.GetCurrentUserId())
	if centerID <= 0 {
		centerID = 1
	}

	nodesDTO, edgesDTO := s.socialGraph.GetEgoGraph(centerID, depth)

	resp := &pb.TopologyResponse{
		TotalNodes: int32(len(nodesDTO)),
		TotalEdges: int32(len(edgesDTO)),
	}

	for _, n := range nodesDTO {
		resp.Nodes = append(resp.Nodes, &pb.GraphNode{
			Id:          int64(n.ID),
			Username:    n.Username,
			DisplayName: n.DisplayName,
			AvatarUrl:   n.AvatarURL,
			Pagerank:    n.Affinity,
		})
	}

	for _, e := range edgesDTO {
		resp.Edges = append(resp.Edges, &pb.GraphEdge{
			Source: int64(e.Source),
			Target: int64(e.Target),
			Weight: e.Weight,
		})
	}

	return resp, nil
}

func (s *server) GetShortestPath(ctx context.Context, req *pb.PathRequest) (*pb.PathResponse, error) {
	dist, pathIDs := s.socialGraph.FindShortestPath(int(req.GetFromUserId()), int(req.GetToUserId()))

	resp := &pb.PathResponse{
		Distance: int32(dist),
	}

	for _, id := range pathIDs {
		username := fmt.Sprintf("user%d", id)
		displayName := fmt.Sprintf("User #%d", id)
		avatarURL := "/static/avatars/default.svg"

		if n, ok := s.socialGraph.GetNode(id); ok {
			username = n.Username
			displayName = n.DisplayName
			avatarURL = n.AvatarURL
		}

		resp.Path = append(resp.Path, &pb.PathStep{
			Id:          int64(id),
			Username:    username,
			DisplayName: displayName,
			AvatarUrl:   avatarURL,
		})
	}

	return resp, nil
}

func (s *server) GetRecommendations(ctx context.Context, req *pb.RecommendationRequest) (*pb.RecommendationResponse, error) {
	limit := int(req.GetLimit())
	if limit <= 0 {
		limit = 6
	}

	recs := s.socialGraph.GetRecommendations(int(req.GetUserId()), limit)

	resp := &pb.RecommendationResponse{}
	for _, r := range recs {
		resp.Recommendations = append(resp.Recommendations, &pb.RecommendationItem{
			UserId:             int64(r.User.ID),
			Username:           r.User.Username,
			DisplayName:        r.User.DisplayName,
			AvatarUrl:          r.User.AvatarURL,
			Score:              r.Score,
			MutualFriendsCount: int32(r.MutualCount),
		})
	}

	return resp, nil
}

func (s *server) RankFeed(ctx context.Context, req *pb.RankFeedRequest) (*pb.RankFeedResponse, error) {
	var candidates []models.Post
	for _, c := range req.GetCandidates() {
		candidates = append(candidates, models.Post{
			ID:            int(c.GetId()),
			UserID:        int(c.GetUserId()),
			Content:       c.GetContent(),
			CreatedAt:     time.Unix(c.GetCreatedAtUnix(), 0),
			LikesCount:    int(c.GetLikesCount()),
			CommentsCount: int(c.GetCommentsCount()),
		})
	}

	ranked := s.rankingEngine.RankFeed(int(req.GetCurrentUserId()), candidates, nil)

	resp := &pb.RankFeedResponse{}
	for _, p := range ranked {
		var f models.RankingFactors
		if p.RankingFactors != nil {
			f = *p.RankingFactors
		}
		resp.RankedPosts = append(resp.RankedPosts, &pb.RankedPost{
			Id:               int64(p.ID),
			UserId:           int64(p.UserID),
			FinalScore:       p.RankingScore,
			AffinityScore:    f.GraphAffinity,
			FreshnessScore:   f.FreshnessScore,
			EngagementScore:  f.EngagementScore,
			TopicScore:       f.TopicMatchScore,
			DiversityPenalty: f.DiversityPenalty,
		})
	}

	return resp, nil
}

func (s *server) ExplainRanking(ctx context.Context, req *pb.ExplainRequest) (*pb.ExplainResponse, error) {
	mockPost := models.Post{
		ID:        int(req.GetPostId()),
		CreatedAt: time.Now().Add(-2 * time.Hour),
	}
	ranked := s.rankingEngine.RankFeed(int(req.GetUserId()), []models.Post{mockPost}, nil)

	var score float64
	var f models.RankingFactors
	if len(ranked) > 0 {
		score = ranked[0].RankingScore
		if ranked[0].RankingFactors != nil {
			f = *ranked[0].RankingFactors
		}
	}

	return &pb.ExplainResponse{
		PostId:           req.GetPostId(),
		TotalScore:       score,
		AffinityScore:    f.GraphAffinity,
		FreshnessScore:   f.FreshnessScore,
		EngagementScore:  f.EngagementScore,
		TopicScore:       f.TopicMatchScore,
		DiversityPenalty: f.DiversityPenalty,
	}, nil
}

func main() {
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "50051"
	}

	log.Println("==================================================")
	log.Println("⚡ GoSocial Graph & Personalized Ranking Microservice")
	log.Printf("🔌 Protocol: gRPC over HTTP/2 (Port: :%s)\n", port)
	log.Println("==================================================")

	// Load DB config if available
	cfg := config.Load()
	db, err := database.InitDB(cfg)
	socialGraph := graph.NewGraph()

	if err == nil {
		if err := socialGraph.BuildFromDB(db); err != nil {
			log.Printf("[Microservice] Warning: BuildFromDB error: %v", err)
		} else {
			nodes, edges := socialGraph.GetEgoGraph(1, 100)
			log.Printf("[Microservice] Loaded %d nodes and %d edges from PostgreSQL", len(nodes), len(edges))
		}
	} else {
		log.Printf("[Microservice] Running with standalone in-memory graph (No DB connection: %v)", err)
		socialGraph.AddNode(1, "oleg", "Олег", "", 1, "Кибер-Новичок", "")
		socialGraph.AddNode(2, "alex", "Алексей", "", 2, "Сетевой Исследователь", "")
		socialGraph.AddNode(3, "sophia", "София", "", 1, "Новичок", "")
		socialGraph.AddEdge(1, 2, 1.0, true)
		socialGraph.AddEdge(2, 3, 1.0, true)
	}

	rankingEngine := ranking.NewEngine(socialGraph)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", port, err)
	}

	grpcServer := grpc.NewServer()
	srv := &server{
		socialGraph:   socialGraph,
		rankingEngine: rankingEngine,
	}

	pb.RegisterGraphRankingServiceServer(grpcServer, srv)
	reflection.Register(grpcServer)

	go func() {
		log.Printf("🚀 gRPC Graph & Ranking Microservice listening on :%s\n", port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutting down gRPC Graph & Ranking Microservice gracefully...")
	grpcServer.GracefulStop()
	log.Println("✅ Microservice stopped.")
}
