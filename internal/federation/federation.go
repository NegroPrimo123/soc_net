package federation

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"

	"social-network/internal/crypto"
	"social-network/internal/models"
)

// Service сервис децентрализованной федерации узлов платформы.
type Service struct {
	nodeName    string
	nodeURL     string
	nodePrivKey string
	nodePubKey  string
}

// NewService создает сервис федерации.
func NewService(nodeName, nodeURL string) *Service {
	pub, priv, err := crypto.GenerateEd25519KeyPair()
	if err != nil {
		pub = "DEMO_FEDERATION_PUBKEY_2077"
		priv = "DEMO_FEDERATION_PRIVKEY_2077"
	}

	return &Service{
		nodeName:    nodeName,
		nodeURL:     nodeURL,
		nodePrivKey: priv,
		nodePubKey:  pub,
	}
}

// GetNodeInfo возвращает параметры локального узла сети.
func (s *Service) GetNodeInfo() (name, url, pubKey string) {
	return s.nodeName, s.nodeURL, s.nodePubKey
}

// CreateSignedEvent создает криптографически подписанный конверт федеративного события.
func (s *Service) CreateSignedEvent(eventType, actorDID string, payload map[string]interface{}) (*models.FederationEvent, error) {
	uuidBytes := make([]byte, 16)
	_, _ = rand.Read(uuidBytes)
	eventID := fmt.Sprintf("%x-%x-%x-%x-%x", uuidBytes[0:4], uuidBytes[4:6], uuidBytes[6:8], uuidBytes[8:10], uuidBytes[10:16])

	now := time.Now().UTC()
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	toSign := fmt.Sprintf("id:%s|type:%s|node:%s|actor:%s|time:%s|payload:%s",
		eventID, eventType, s.nodeName, actorDID, now.Format(time.RFC3339), string(payloadBytes))

	signature, err := crypto.SignMessage(s.nodePrivKey, []byte(toSign))
	if err != nil {
		return nil, fmt.Errorf("failed to sign federation event: %w", err)
	}

	return &models.FederationEvent{
		EventID:    eventID,
		EventType:  eventType,
		OriginNode: s.nodeName,
		ActorDID:   actorDID,
		Payload:    payload,
		Timestamp:  now,
		Signature:  signature,
	}, nil
}

// VerifyEvent проверяет цифровую подпись входящего федеративного события.
func (s *Service) VerifyEvent(event *models.FederationEvent, senderPubKey string) bool {
	if event == nil || event.Signature == "" {
		return false
	}

	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return false
	}

	toSign := fmt.Sprintf("id:%s|type:%s|node:%s|actor:%s|time:%s|payload:%s",
		event.EventID, event.EventType, event.OriginNode, event.ActorDID, event.Timestamp.UTC().Format(time.RFC3339), string(payloadBytes))

	return crypto.VerifySignature(senderPubKey, []byte(toSign), event.Signature)
}
