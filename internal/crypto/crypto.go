package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"

	"golang.org/x/crypto/curve25519"
)

// GenerateEd25519KeyPair генерирует новую пару ключей Ed25519 для цифровых подписей.
func GenerateEd25519KeyPair() (pubBase64, privBase64 string, err error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", "", fmt.Errorf("ed25519 keygen error: %w", err)
	}
	pubBase64 = base64.StdEncoding.EncodeToString(pub)
	privBase64 = base64.StdEncoding.EncodeToString(priv)
	return pubBase64, privBase64, nil
}

// SignMessage подписывает срез байтов приватным ключом Ed25519.
func SignMessage(privKeyBase64 string, data []byte) (string, error) {
	privBytes, err := base64.StdEncoding.DecodeString(privKeyBase64)
	if err != nil {
		return "", fmt.Errorf("invalid base64 private key: %w", err)
	}
	if len(privBytes) != ed25519.PrivateKeySize {
		return "", errors.New("invalid ed25519 private key length")
	}
	privKey := ed25519.PrivateKey(privBytes)
	signature := ed25519.Sign(privKey, data)
	return base64.StdEncoding.EncodeToString(signature), nil
}

// VerifySignature проверяет подпись Ed25519 для данных.
func VerifySignature(pubKeyBase64 string, data []byte, signatureBase64 string) bool {
	pubBytes, err := base64.StdEncoding.DecodeString(pubKeyBase64)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		return false
	}
	sigBytes, err := base64.StdEncoding.DecodeString(signatureBase64)
	if err != nil || len(sigBytes) != ed25519.SignatureSize {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(pubBytes), data, sigBytes)
}

// GenerateX25519KeyPair генерирует пару ключей Curve25519 (X25519) для Diffie-Hellman обмена.
func GenerateX25519KeyPair() (pubBase64, privBase64 string, err error) {
	var priv [32]byte
	if _, err := io.ReadFull(rand.Reader, priv[:]); err != nil {
		return "", "", fmt.Errorf("failed to generate random bytes for x25519: %w", err)
	}
	pub, err := curve25519.X25519(priv[:], curve25519.Basepoint)
	if err != nil {
		return "", "", fmt.Errorf("x25519 basepoint mult error: %w", err)
	}
	return base64.StdEncoding.EncodeToString(pub), base64.StdEncoding.EncodeToString(priv[:]), nil
}

// ComputeX25519SharedSecret вычисляет общий симметричный секрет между приватным ключом и чужим публичным ключом.
func ComputeX25519SharedSecret(privBase64, peerPubBase64 string) ([]byte, error) {
	privBytes, err := base64.StdEncoding.DecodeString(privBase64)
	if err != nil || len(privBytes) != 32 {
		return nil, errors.New("invalid private key for x25519")
	}
	pubBytes, err := base64.StdEncoding.DecodeString(peerPubBase64)
	if err != nil || len(pubBytes) != 32 {
		return nil, errors.New("invalid peer public key for x25519")
	}

	sharedKey, err := curve25519.X25519(privBytes, pubBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to derive shared secret: %w", err)
	}

	// Хэшируем общий секрет через SHA-256 для выравнивания криптографической энтропии (KDF)
	derivedKey := sha256.Sum256(sharedKey)
	return derivedKey[:], nil
}

// EncryptAESGCM выполняет аутентифицированное симметричное шифрование AES-256-GCM.
func EncryptAESGCM(key []byte, plaintext []byte) (ciphertextBase64, nonceBase64 string, err error) {
	if len(key) != 32 {
		return "", "", errors.New("encryption key must be 32 bytes for AES-256")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", err
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), base64.StdEncoding.EncodeToString(nonce), nil
}

// DecryptAESGCM расшифровывает сообщение по ключу и нонсу.
func DecryptAESGCM(key []byte, ciphertextBase64, nonceBase64 string) ([]byte, error) {
	if len(key) != 32 {
		return nil, errors.New("decryption key must be 32 bytes for AES-256")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return nil, err
	}
	nonce, err := base64.StdEncoding.DecodeString(nonceBase64)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	if len(nonce) != gcm.NonceSize() {
		return nil, errors.New("invalid nonce size")
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("authentication failed: %w", err)
	}
	return plaintext, nil
}

// ComputeFingerprint вычисляет читаемый отпечаток безопасности ключа (Safety Number).
// Формат: "A4F2 : 9B10 : C8E3 : 5D01"
func ComputeFingerprint(pubKeyBase64 string) string {
	raw, err := base64.StdEncoding.DecodeString(pubKeyBase64)
	if err != nil || len(raw) == 0 {
		raw = []byte(pubKeyBase64)
	}
	hash := sha256.Sum256(raw)
	hexStr := strings.ToUpper(hex.EncodeToString(hash[:16]))

	var chunks []string
	for i := 0; i < len(hexStr); i += 4 {
		end := i + 4
		if end > len(hexStr) {
			end = len(hexStr)
		}
		chunks = append(chunks, hexStr[i:end])
	}
	return strings.Join(chunks, " : ")
}

// ComputePostContentHash формирует канонический хэш SHA-256 контента публикации для проверки подписи.
func ComputePostContentHash(authorID int, content, imageURL, musicURL string, channelID, pollID *int) []byte {
	chStr := "0"
	if channelID != nil {
		chStr = fmt.Sprintf("%d", *channelID)
	}
	pollStr := "0"
	if pollID != nil {
		pollStr = fmt.Sprintf("%d", *pollID)
	}
	payload := fmt.Sprintf("author:%d|content:%s|image:%s|music:%s|ch:%s|poll:%s",
		authorID, strings.TrimSpace(content), strings.TrimSpace(imageURL), strings.TrimSpace(musicURL), chStr, pollStr)
	hash := sha256.Sum256([]byte(payload))
	return hash[:]
}
