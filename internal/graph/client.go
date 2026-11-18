package graph

import (
	"context"
	"log"
	"time"

	pb "social-network/proto/graphranking"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// RemoteClient инкапсулирует подключение gRPC к независимому микросервису графа и ранжирования.
type RemoteClient struct {
	conn   *grpc.ClientConn
	client pb.GraphRankingServiceClient
	addr   string
}

// NewRemoteClient создает клиент gRPC с таймаутом подключения.
func NewRemoteClient(addr string) (*RemoteClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, err
	}

	client := pb.NewGraphRankingServiceClient(conn)
	log.Printf("[gRPC Client] Успешно подключено к микросервису графа и ранжирования (%s)", addr)
	return &RemoteClient{
		conn:   conn,
		client: client,
		addr:   addr,
	}, nil
}

// Close закрывает gRPC соединение.
func (c *RemoteClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// Client возвращает интерфейс вызовов RPC.
func (c *RemoteClient) Client() pb.GraphRankingServiceClient {
	return c.client
}
