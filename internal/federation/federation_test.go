package federation

import (
	"testing"
)

func TestFederationEventSigningAndVerification(t *testing.T) {
	svc := NewService("node-alpha.neonet.org", "https://node-alpha.neonet.org")

	payload := map[string]interface{}{
		"post_id": 42,
		"content": "Decentralized federated broadcast to all mesh peers",
		"author":  "itakwa",
	}

	event, err := svc.CreateSignedEvent("post.created", "did:gosocial:itakwa@node-alpha", payload)
	if err != nil {
		t.Fatalf("failed to create signed event: %v", err)
	}

	_, _, pubKey := svc.GetNodeInfo()
	if !svc.VerifyEvent(event, pubKey) {
		t.Fatalf("valid event failed verification")
	}

	// Tampered payload must fail
	event.Payload["content"] = "Tampered hacker content"
	if svc.VerifyEvent(event, pubKey) {
		t.Fatalf("tampered event must fail verification")
	}
}
