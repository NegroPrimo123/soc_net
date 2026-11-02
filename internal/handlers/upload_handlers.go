package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var safeFilenameRegex = regexp.MustCompile(`[^a-zA-Z0-9_\-\.]`)

func (h *Handler) UploadFile(w http.ResponseWriter, r *http.Request) {
	currentUser := h.getUserFromRequest(r)
	if currentUser == nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Войдите в систему для загрузки файлов"})
		return
	}

	// Ограничение размера файла: 30 МБ
	if err := r.ParseMultipartForm(30 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Файл превышает допустимый размер (максимум 30 МБ)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Поле файла 'file' не найдено в форме"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
		".webp": true, ".svg": true, ".bmp": true, ".ico": true,
		".pdf": true, ".txt": true, ".doc": true, ".docx": true,
		".zip": true, ".rar": true, ".7z": true,
	}

	if !allowedExts[ext] {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("Формат файла '%s' не поддерживается", ext)})
		return
	}

	uploadDir := filepath.Join("web", "uploads")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Не удалось создать каталог загрузок"})
		return
	}

	baseName := strings.TrimSuffix(header.Filename, ext)
	safeBase := safeFilenameRegex.ReplaceAllString(baseName, "_")
	if len(safeBase) > 40 {
		safeBase = safeBase[:40]
	}
	if safeBase == "" {
		safeBase = "upload"
	}

	uniqueFilename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), safeBase, ext)
	targetPath := filepath.Join(uploadDir, uniqueFilename)

	dst, err := os.Create(targetPath)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Ошибка сохранения файла на диск"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Ошибка записи данных на диск"})
		return
	}

	imageExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
		".webp": true, ".svg": true, ".bmp": true,
	}
	isImage := imageExts[ext]

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"url":       "/uploads/" + uniqueFilename,
		"filename":  header.Filename,
		"size":      header.Size,
		"is_image":  isImage,
		"extension": ext,
	})
}
