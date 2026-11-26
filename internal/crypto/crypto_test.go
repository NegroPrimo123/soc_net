package crypto

import (
	"bytes"
	"testing"
)

func TestEd25519SignAndVerify(t *testing.T) {
	pub, priv, err := GenerateEd25519KeyPair()
	if err != nil {
		t.Fatalf("keygen failed: %v", err)
	}

	data := []byte("Cyberpunk decentralized post content 2077")
	sig, err := SignMessage(priv, data)
	if err != nil {
		t.Fatalf("sign failed: %v", err)
	}

	origValid := VerifySignature(pub, data, sig)
	if !origValid {
		t.Fatalf("signature verification failed")
	}
	t.Logf("[Ed25519 Original]: payload=\"%s\", verified=%v", string(data), origValid)

	// Tampered data must fail (1 character changed)
	tampered := []byte("Cyberpunk decentralized post content 2078")
	tamperedValid := VerifySignature(pub, tampered, sig)
	t.Logf("[Ed25519 Tamper Test]: tampered_payload=\"%s\", verified=%v (tamper rejected)", string(tampered), tamperedValid)
	if tamperedValid {
		t.Fatalf("signature verification should have failed on tampered data")
	}
}

func TestX25519ECDHAndAESGCM(t *testing.T) {
	// User A
	alicePub, alicePriv, err := GenerateX25519KeyPair()
	if err != nil {
		t.Fatalf("alice keygen failed: %v", err)
	}

	// User B
	bobPub, bobPriv, err := GenerateX25519KeyPair()
	if err != nil {
		t.Fatalf("bob keygen failed: %v", err)
	}

	// Alice computes secret with Bob's public key
	aliceShared, err := ComputeX25519SharedSecret(alicePriv, bobPub)
	if err != nil {
		t.Fatalf("alice shared secret failed: %v", err)
	}

	// Bob computes secret with Alice's public key
	bobShared, err := ComputeX25519SharedSecret(bobPriv, alicePub)
	if err != nil {
		t.Fatalf("bob shared secret failed: %v", err)
	}

	if !bytes.Equal(aliceShared, bobShared) {
		t.Fatalf("ECDH shared secrets do not match!")
	}

	// Alice encrypts a secret message for Bob
	secretMessage := []byte("Top secret: meet at Afterlife bar, 23:00")
	ciphertext, nonce, err := EncryptAESGCM(aliceShared, secretMessage)
	if err != nil {
		t.Fatalf("encryption failed: %v", err)
	}

	// Bob decrypts the message
	decrypted, err := DecryptAESGCM(bobShared, ciphertext, nonce)
	if err != nil {
		t.Fatalf("decryption failed: %v", err)
	}

	if string(decrypted) != string(secretMessage) {
		t.Fatalf("decrypted text mismatch: got %s, want %s", string(decrypted), string(secretMessage))
	}
}

func TestFingerprint(t *testing.T) {
	pub, _, err := GenerateEd25519KeyPair()
	if err != nil {
		t.Fatalf("keygen failed: %v", err)
	}
	fp := ComputeFingerprint(pub)
	if len(fp) == 0 || len(fp) < 16 {
		t.Fatalf("fingerprint looks invalid: %s", fp)
	}
}
