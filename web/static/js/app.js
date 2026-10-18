// GoSocial Client-side Application Logic v2.0 (with Auth, Toast & Modals)

document.addEventListener('DOMContentLoaded', () => {
    initComposer();
    formatAllPostContents();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'login') openAuthModal('login');
    if (urlParams.get('auth') === 'register') openAuthModal('register');

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAuthModal();
    });
});

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : '❌';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================
// AUTHENTICATION MODALS & ACTIONS
// ==========================================
function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'flex';
    switchAuthTab(tab);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');

    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        document.getElementById('loginUsername').focus();
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        tabLoginBtn.classList.remove('active');
        tabRegisterBtn.classList.add('active');
        document.getElementById('regUsername').focus();
    }
}

async function fillAndLogin(username, password) {
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
    await submitLogin(username, password);
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    await submitLogin(username, password);
}

async function submitLogin(username, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Ошибка авторизации');
        }

        showToast(`Добро пожаловать, ${data.user.display_name}! 🚀`, 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 300);
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go! Убедитесь, что сервер запущен.' : err.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const bio = document.getElementById('regBio').value.trim();
    const avatarUrl = document.getElementById('regAvatar').value.trim();

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                display_name: displayName,
                password: password,
                bio: bio,
                avatar_url: avatarUrl
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Ошибка регистрации');
        }

        showToast(`Аккаунт @${data.user.username} успешно создан! 🎉`, 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 400);
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go! Убедитесь, что сервер запущен.' : err.message, 'error');
    }
}


async function handleLogout() {
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if (res.ok) {
            showToast('Вы вышли из системы 👋', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
        }
    } catch (err) {
        window.location.href = '/';
    }
}

// ==========================================
// NAVIGATION & TABS
// ==========================================
function switchFeedTab(tab) {
    const params = new URLSearchParams(window.location.search);
    params.set('feed_type', tab);
    params.delete('q');
    params.delete('tag');
    window.location.search = params.toString();
}

function executeSearch() {
    const input = document.getElementById('searchInput');
    const val = input.value.trim();
    const params = new URLSearchParams(window.location.search);
    if (val) {
        if (val.startsWith('#')) {
            params.set('tag', val);
            params.delete('q');
        } else {
            params.set('q', val);
            params.delete('tag');
        }
    } else {
        params.delete('q');
        params.delete('tag');
    }
    window.location.search = params.toString();
}

function clearSearch() {
    const params = new URLSearchParams(window.location.search);
    params.delete('q');
    params.delete('tag');
    window.location.search = params.toString();
}

function filterByTag(tag) {
    const params = new URLSearchParams(window.location.search);
    params.set('tag', tag);
    params.delete('q');
    window.location.search = params.toString();
}

function insertTag(tag) {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    textarea.value = (textarea.value.trim() + ' ' + tag).trim() + ' ';
    textarea.focus();
    triggerCharCount();
}

// ==========================================
// COMPOSER & IMAGE ATTACHMENTS
// ==========================================
function initComposer() {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    textarea.addEventListener('input', triggerCharCount);
}

function triggerCharCount() {
    const textarea = document.getElementById('postContent');
    const charCount = document.getElementById('charCount');
    if (!textarea || !charCount) return;
    const len = textarea.value.length;
    charCount.textContent = `${len} / 500`;
    charCount.style.color = (len > 500) ? '#ef4444' : 'var(--text-muted)';
}

function toggleImageBox() {
    const box = document.getElementById('postImageBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none') ? 'flex' : 'none';
    if (box.style.display === 'flex') {
        document.getElementById('postImageUrl').focus();
    }
}

function setImagePreset(url) {
    const input = document.getElementById('postImageUrl');
    if (!input) return;
    input.value = url;
    updateImagePreview();
}

function updateImagePreview() {
    const input = document.getElementById('postImageUrl');
    const container = document.getElementById('imagePreviewContainer');
    const preview = document.getElementById('imagePreview');
    const url = input.value.trim();

    if (url) {
        preview.src = url;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function clearImageInput() {
    const input = document.getElementById('postImageUrl');
    const container = document.getElementById('imagePreviewContainer');
    if (input) input.value = '';
    if (container) container.style.display = 'none';
}

async function createPost() {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт, чтобы опубликовать запись 🔐', 'error');
        openAuthModal('login');
        return;
    }

    const textarea = document.getElementById('postContent');
    const content = textarea.value.trim();
    const imageInput = document.getElementById('postImageUrl');
    const imageUrl = imageInput ? imageInput.value.trim() : '';

    if (!content && !imageUrl) {
        showToast('Введите текст публикации или прикрепите фото', 'error');
        return;
    }

    if (content.length > 500) {
        showToast('Длина текста превышает 500 символов', 'error');
        return;
    }

    try {
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: imageUrl
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка при публикации');
        }

        const post = await response.json();
        textarea.value = '';
        triggerCharCount();
        clearImageInput();
        const imageBox = document.getElementById('postImageBox');
        if (imageBox) imageBox.style.display = 'none';

        renderPostAtTop(post);

        const statPosts = document.getElementById('statPosts');
        if (statPosts) {
            statPosts.textContent = parseInt(statPosts.textContent || '0') + 1;
        }

        const emptyNotice = document.querySelector('.empty-feed-card');
        if (emptyNotice) emptyNotice.remove();

        showToast('Публикация успешно размещена! 🚀', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go! Проверьте бэкенд.' : err.message, 'error');
    }
}

// ==========================================
// EDIT & DELETE POSTS
// ==========================================
function openEditPost(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для редактирования ✏️', 'error');
        openAuthModal('login');
        return;
    }
    const contentEl = document.getElementById(`post-content-${postId}`);

    const editBox = document.getElementById(`post-edit-box-${postId}`);
    if (contentEl && editBox) {
        contentEl.style.display = 'none';
        editBox.style.display = 'flex';
        const textarea = document.getElementById(`edit-textarea-${postId}`);
        if (textarea) textarea.focus();
    }
}

function cancelEditPost(postId) {
    const contentEl = document.getElementById(`post-content-${postId}`);
    const editBox = document.getElementById(`post-edit-box-${postId}`);
    if (contentEl && editBox) {
        contentEl.style.display = 'block';
        editBox.style.display = 'none';
    }
}

async function saveEditPost(postId) {
    const textarea = document.getElementById(`edit-textarea-${postId}`);
    const newContent = textarea.value.trim();

    if (!newContent) {
        showToast('Текст не может быть пустым', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: newContent
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка сохранения');
        }

        const post = await response.json();
        const contentEl = document.getElementById(`post-content-${postId}`);
        contentEl.innerHTML = formatHashtags(post.content);
        contentEl.style.display = 'block';

        const editBox = document.getElementById(`post-edit-box-${postId}`);
        if (editBox) editBox.style.display = 'none';

        const metaLine = document.querySelector(`#post-${postId} .meta-line`);
        if (metaLine && !metaLine.querySelector('.edited-badge')) {
            const badge = document.createElement('span');
            badge.className = 'edited-badge';
            badge.textContent = '• (изменено)';
            metaLine.appendChild(badge);
        }

        showToast('Публикация обновлена ✏️', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deletePost(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для удаления публикации 🗑️', 'error');
        openAuthModal('login');
        return;
    }
    if (!confirm('Вы уверены, что хотите удалить этот пост?')) return;

    try {
        const response = await fetch(`/api/posts/${postId}?user_id=${window.CURRENT_USER_ID}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка удаления');
        }

        const postCard = document.getElementById(`post-${postId}`);
        if (postCard) postCard.remove();

        const statPosts = document.getElementById('statPosts');
        if (statPosts) {
            let current = parseInt(statPosts.textContent || '0');
            statPosts.textContent = Math.max(0, current - 1);
        }

        showToast('Публикация удалена 🗑️', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go!' : err.message, 'error');
    }
}

// ==========================================
// LIKES & COMMENTS
// ==========================================
async function toggleLike(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы ставить лайки ❤️', 'error');
        openAuthModal('login');
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID
            })
        });

        if (!response.ok) throw new Error('Ошибка при лайке');

        const data = await response.json();
        const postCard = document.getElementById(`post-${postId}`);
        const likeBtn = postCard.querySelector('.like-btn');
        const likeCount = document.getElementById(`likes-${postId}`);
        const heartIcon = likeBtn.querySelector('.heart-icon');

        likeCount.textContent = data.likes_count;

        if (data.is_liked) {
            likeBtn.classList.add('active');
            heartIcon.setAttribute('fill', 'currentColor');
        } else {
            likeBtn.classList.remove('active');
            heartIcon.setAttribute('fill', 'none');
        }
    } catch (err) {
        console.error('Like error:', err);
    }
}

function toggleComments(postId) {
    const section = document.getElementById(`comments-section-${postId}`);
    if (!section) return;
    section.style.display = (section.style.display === 'none') ? 'block' : 'none';
}

async function addComment(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы оставить комментарий 💬', 'error');
        openAuthModal('login');
        return;
    }

    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();

    if (!content) return;

    try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content
            })
        });

        if (!response.ok) throw new Error('Ошибка комментирования');

        const comment = await response.json();
        input.value = '';

        const commentsList = document.getElementById(`comments-list-${postId}`);
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.innerHTML = `
            <img src="${escapeHtml(comment.user.avatar_url)}" alt="avatar" class="comment-avatar">
            <div class="comment-bubble">
                <div class="comment-author-line">
                    <span class="comment-author">${escapeHtml(comment.user.display_name)}</span>
                    <span class="comment-time">${formatTime(comment.created_at)}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>
            </div>
        `;
        commentsList.appendChild(commentEl);

        const countEl = document.getElementById(`comment-count-${postId}`);
        if (countEl) {
            countEl.textContent = parseInt(countEl.textContent || '0') + 1;
        }

        showToast('Комментарий добавлен 💬', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go!' : err.message, 'error');
    }
}

async function toggleFollow(targetUserId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы подписываться на авторов 👥', 'error');
        openAuthModal('login');
        return;
    }

    try {
        const response = await fetch('/api/users/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                follower_id: window.CURRENT_USER_ID,
                following_id: targetUserId
            })
        });

        if (!response.ok) throw new Error('Ошибка подписки');

        const data = await response.json();
        const userRow = document.getElementById(`user-row-${targetUserId}`);
        const followBtn = userRow.querySelector('button');

        if (data.is_following) {
            followBtn.textContent = 'Читаю';
            followBtn.classList.add('btn-following');
            showToast('Вы подписались на автора! 👥', 'success');
        } else {
            followBtn.textContent = 'Читать';
            followBtn.classList.remove('btn-following');
            showToast('Вы отписались от автора', 'success');
        }

        const statFollowing = document.getElementById('statFollowing');
        if (statFollowing) {
            let current = parseInt(statFollowing.textContent || '0');
            statFollowing.textContent = data.is_following ? current + 1 : Math.max(0, current - 1);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// RENDER HELPERS
// ==========================================
function renderPostAtTop(post) {
    const container = document.getElementById('postsContainer');
    const postEl = createPostElement(post);
    container.insertBefore(postEl, container.firstChild);
}

function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'card post-card';
    article.id = `post-${post.id}`;

    const formattedDate = formatFullDate(post.created_at);
    const isLiked = post.is_liked;

    let mediaHtml = '';
    if (post.image_url) {
        mediaHtml = `
            <div class="post-media" id="post-media-${post.id}">
                <img src="${escapeHtml(post.image_url)}" alt="Фото к посту" loading="lazy">
            </div>
        `;
    }

    let editedHtml = post.is_edited ? `<span class="edited-badge">• (изменено)</span>` : '';

    article.innerHTML = `
        <div class="post-header">
            <img src="${escapeHtml(post.user.avatar_url)}" alt="${escapeHtml(post.user.display_name)}" class="mini-avatar">
            <div class="post-user-info">
                <div class="author-line">
                    <span class="post-author">${escapeHtml(post.user.display_name)}</span>
                    <span class="post-handle">@${escapeHtml(post.user.username)}</span>
                </div>
                <div class="meta-line">
                    <time class="post-time">${formattedDate}</time>
                    ${editedHtml}
                </div>
            </div>
            <div class="post-header-actions">
                <button class="btn-icon-action btn-edit" title="Редактировать пост" onclick="openEditPost(${post.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button class="btn-icon-action btn-delete" title="Удалить пост" onclick="deletePost(${post.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
        <div class="post-content" id="post-content-${post.id}">
            ${formatHashtags(post.content)}
        </div>
        <div class="post-edit-box" id="post-edit-box-${post.id}" style="display: none;">
            <textarea id="edit-textarea-${post.id}" rows="3">${escapeHtml(post.content)}</textarea>
            <div class="edit-actions">
                <button class="btn btn-primary btn-xs" onclick="saveEditPost(${post.id})">Сохранить</button>
                <button class="btn btn-secondary btn-xs" onclick="cancelEditPost(${post.id})">Отмена</button>
            </div>
        </div>
        ${mediaHtml}
        <div class="post-footer">
            <button class="btn-action like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike(${post.id})">
                <svg class="heart-icon" width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                </svg>
                <span class="like-count" id="likes-${post.id}">${post.likes_count}</span>
            </button>

            <button class="btn-action comment-toggle-btn" onclick="toggleComments(${post.id})">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span id="comment-count-${post.id}">0</span>
            </button>
        </div>
        <div class="comments-section" id="comments-section-${post.id}" style="display: block;">
            <div class="comments-list" id="comments-list-${post.id}"></div>
            <div class="comment-input-row">
                <input type="text" id="comment-input-${post.id}" placeholder="Напишите комментарий..." onkeydown="if(event.key==='Enter') addComment(${post.id})">
                <button class="btn btn-secondary btn-sm" onclick="addComment(${post.id})">Отправить</button>
            </div>
        </div>
    `;

    return article;
}

function formatAllPostContents() {
    document.querySelectorAll('.post-content').forEach(el => {
        el.innerHTML = formatHashtags(el.textContent.trim());
    });
}

function formatHashtags(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/#([\w\u0400-\u04FF]+)/gi, (match) => {
        return `<span class="hashtag-link" onclick="filterByTag('${match}')">${match}</span>`;
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(isoString) {
    const d = new Date(isoString);
    return `${formatTime(isoString)} ${d.toLocaleDateString()}`;
}
