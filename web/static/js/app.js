// GoSocial Client-side Application Logic v7.0 (Minimalist Cyberpunk Edition)

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initComposer();
    formatAllPostContents();
    initSSE();
    initProfileCardTilt();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'login') openAuthModal('login');
    if (urlParams.get('auth') === 'register') openAuthModal('register');

    // Routing by view/user
    const viewParam = urlParams.get('view');
    const userParam = urlParams.get('user');
    const sendGiftParam = urlParams.get('send_gift');
    const giftDetailParam = urlParams.get('gift_detail');

    if (viewParam === 'showcase') {
        navigateTo('showcase');
    } else if (userParam || viewParam === 'profile') {
        const uid = parseInt(userParam || window.CURRENT_USER_ID, 10);
        navigateTo('profile', uid);
    }

    if (sendGiftParam) {
        window.IS_AUTHENTICATED = true;
        window.CURRENT_USER_ID = 1;
        openSendGiftModal(parseInt(sendGiftParam, 10), 'Алексей Ковалев', 'alex');
    } else if (giftDetailParam) {
        openGiftDetailById(parseInt(giftDetailParam, 10));
    }

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAuthModal();
            closeSendGiftModal();
            closeGiftDetailModal();
            closeEditProfileModal();
        }
    });
});

// ==========================================
// TELEMETRY CLOCK
// ==========================================
function initClock() {
    const el = document.getElementById('telemetryClock');
    if (!el) return;
    const update = () => {
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        el.textContent = `CYBER // ${timeStr}`;
    };
    update();
    setInterval(update, 1000);
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '⚡' : '✕';
    toast.innerHTML = `<span style="font-weight: bold; color: ${type==='success'?'#00f0ff':'#ff0055'};">${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        setTimeout(() => toast.remove(), 250);
    }, 3200);
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
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером! Убедитесь, что сервер запущен.' : err.message, 'error');
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

        showToast('Аккаунт успешно создан! Авторизация...', 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 300);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast('Сессия завершена', 'success');
        setTimeout(() => {
            window.location.href = '/';
        }, 300);
    } catch (err) {
        window.location.reload();
    }
}

// ==========================================
// COMPOSER & POSTS
// ==========================================
function initComposer() {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;

    textarea.addEventListener('input', () => {
        handleComposerInput();
    });
}

function handleComposerInput() {
    const textarea = document.getElementById('postContent');
    const charCount = document.getElementById('charCount');
    if (!textarea || !charCount) return;

    charCount.textContent = `${textarea.value.length} / 500`;
    if (textarea.value.length > 500) {
        charCount.style.color = '#ff0055';
    } else {
        charCount.style.color = '#64748b';
    }
}

function expandComposer() {
    const drawer = document.getElementById('composerDrawer');
    if (drawer) drawer.style.display = 'block';
    const textarea = document.getElementById('postContent');
    if (textarea && textarea.rows < 3) textarea.rows = 3;
}

function focusMainComposer() {
    navigateTo('feed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const textarea = document.getElementById('postContent');
    if (textarea) {
        expandComposer();
        textarea.focus();
    }
}

function toggleImageBox() {
    const box = document.getElementById('composerImageBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none') ? 'block' : 'none';
}

function setImagePreset(url) {
    const input = document.getElementById('postImageUrl');
    if (input) {
        input.value = url;
        updateImagePreview();
    }
}

function updateImagePreview() {
    const input = document.getElementById('postImageUrl');
    const container = document.getElementById('imagePreviewContainer');
    const img = document.getElementById('imagePreview');
    if (!input || !container || !img) return;

    const url = input.value.trim();
    if (url) {
        img.src = url;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function clearImageInput() {
    const input = document.getElementById('postImageUrl');
    const container = document.getElementById('imagePreviewContainer');
    const img = document.getElementById('imagePreview');
    if (input) input.value = '';
    if (container) container.style.display = 'none';
    if (img) img.src = '';
}

function insertTag(tag) {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    expandComposer();
    const cur = textarea.value.trim();
    textarea.value = cur ? `${cur} ${tag}` : tag;
    handleComposerInput();
    textarea.focus();
}

async function createPost() {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт для публикации 🔐', 'error');
        openAuthModal('login');
        return;
    }

    const textarea = document.getElementById('postContent');
    const content = textarea.value.trim();
    const imageInput = document.getElementById('postImageUrl');
    const imageUrl = imageInput ? imageInput.value.trim() : '';

    if (!content && !imageUrl) {
        showToast('Введите текст публикации или ссылку на фото', 'error');
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
        handleComposerInput();
        clearImageInput();
        const imageBox = document.getElementById('composerImageBox');
        if (imageBox) imageBox.style.display = 'none';

        renderPostAtTop(post);

        const emptyNotice = document.querySelector('.cyber-empty-card');
        if (emptyNotice) emptyNotice.remove();

        showToast('Публикация успешно размещена! 🚀', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go!' : err.message, 'error');
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
            badge.textContent = '• (ред.)';
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
    if (!confirm('Удалить эту публикацию?')) return;

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

        showToast('Публикация удалена 🗑️', 'success');
    } catch (err) {
        showToast(err.message, 'error');
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

        showToast('Комментарий отправлен 💬', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleFollow(targetUserId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы подписываться 👥', 'error');
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
        if (userRow) {
            const followBtn = userRow.querySelector('button');
            if (data.is_following) {
                followBtn.textContent = 'Читаю';
                followBtn.classList.add('btn-following');
                showToast('Вы подписались на автора! 👥', 'success');
            } else {
                followBtn.textContent = 'Читать';
                followBtn.classList.remove('btn-following');
                showToast('Вы отписались', 'success');
            }
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
    if (!container) return;
    const postEl = createPostElement(post);
    container.insertBefore(postEl, container.firstChild);
}

function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'cyber-post-card';
    article.id = `post-${post.id}`;

    const formattedDate = formatFullDate(post.created_at);
    const isLiked = post.is_liked;

    let mediaHtml = '';
    if (post.image_url) {
        mediaHtml = `
            <div class="post-media" id="post-media-${post.id}">
                <img src="${escapeHtml(post.image_url)}" alt="Медиа" loading="lazy">
            </div>
        `;
    }

    let editedHtml = post.is_edited ? `<span class="edited-badge">• (ред.)</span>` : '';

    article.innerHTML = `
        <div class="post-header">
            <img src="${escapeHtml(post.user.avatar_url)}" alt="${escapeHtml(post.user.display_name)}" class="mini-avatar cursor-pointer" onclick="openUserProfile(${post.user.id})">
            <div class="post-user-info">
                <div class="author-line">
                    <span class="post-author cursor-pointer" onclick="openUserProfile(${post.user.id})">${escapeHtml(post.user.display_name)}</span>
                    <span class="post-handle cursor-pointer" onclick="openUserProfile(${post.user.id})">@${escapeHtml(post.user.username)}</span>
                </div>
                <div class="meta-line">
                    <time class="post-time">${formattedDate}</time>
                    ${editedHtml}
                </div>
            </div>
            <div class="post-header-actions">
                <button class="btn-icon-action btn-edit" title="Редактировать" onclick="openEditPost(${post.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button class="btn-icon-action btn-delete" title="Удалить" onclick="deletePost(${post.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
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
            <button class="post-action-btn like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike(${post.id})">
                <svg class="heart-icon" width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                </svg>
                <span class="like-count" id="likes-${post.id}">${post.likes_count}</span>
            </button>

            <button class="post-action-btn comment-btn" onclick="toggleComments(${post.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span id="comment-count-${post.id}">0</span>
            </button>

            <button class="post-action-btn gift-btn" onclick="openSendGiftModal(${post.user.id}, '${escapeHtml(post.user.display_name)}', '${escapeHtml(post.user.username)}')" title="Отправить артефакт">
                <span class="gift-icon">🎁</span>
                <span>Подарок</span>
            </button>
        </div>
        <div class="comments-section" id="comments-section-${post.id}" style="display: block;">
            <div class="comments-list" id="comments-list-${post.id}"></div>
            <div class="comment-input-row">
                <input type="text" id="comment-input-${post.id}" placeholder="Написать комментарий..." onkeydown="if(event.key==='Enter') addComment(${post.id})">
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
        return `<span class="post-hashtag" onclick="filterByTag('${match}')">${match}</span>`;
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
    return `${formatTime(isoString)} • ${d.toLocaleDateString()}`;
}

// ==========================================
// SEARCH & TAGS
// ==========================================
function executeSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    const q = input.value.trim();
    if (q) {
        window.location.href = `/?q=${encodeURIComponent(q)}`;
    } else {
        clearSearch();
    }
}

function clearSearch() {
    window.location.href = '/';
}

function filterByTag(tag) {
    window.location.href = `/?tag=${encodeURIComponent(tag)}`;
}

function switchFeedTab(type) {
    window.location.href = `/?feed_type=${type}`;
}

// ==========================================
// REAL-TIME SERVER-SENT EVENTS (SSE)
// ==========================================
function initSSE() {
    if (!window.EventSource) return;

    try {
        const es = new EventSource('/api/events');

        es.onmessage = (e) => {
            if (!e.data) return;
            try {
                const event = JSON.parse(e.data);
                handleSSEEvent(event);
            } catch (err) {}
        };

        es.onerror = () => {
            // Reconnection handled automatically by browser EventSource
        };
    } catch (e) {}
}

function handleSSEEvent(event) {
    switch (event.type) {
        case 'new_post':
            if (event.post && event.post.user_id !== window.CURRENT_USER_ID) {
                renderPostAtTop(event.post);
                showToast(`Новый пост от ${event.post.user.display_name}! 🚀`, 'success');
            }
            break;

        case 'like_update':
            const likeCount = document.getElementById(`likes-${event.post_id}`);
            if (likeCount) likeCount.textContent = event.likes_count;
            break;

        case 'new_comment':
            const countEl = document.getElementById(`comment-count-${event.post_id}`);
            if (countEl) countEl.textContent = event.comments_count;

            const commentsList = document.getElementById(`comments-list-${event.post_id}`);
            if (commentsList && event.comment && event.comment.user_id !== window.CURRENT_USER_ID) {
                const c = event.comment;
                const commentEl = document.createElement('div');
                commentEl.className = 'comment-item';
                commentEl.innerHTML = `
                    <img src="${escapeHtml(c.user.avatar_url)}" alt="avatar" class="comment-avatar">
                    <div class="comment-bubble">
                        <div class="comment-author-line">
                            <span class="comment-author">${escapeHtml(c.user.display_name)}</span>
                            <span class="comment-time">${formatTime(c.created_at)}</span>
                        </div>
                        <div class="comment-text">${escapeHtml(c.content)}</div>
                    </div>
                `;
                commentsList.appendChild(commentEl);
            }
            break;

        case 'new_gift':
            if (event.gift) {
                showToast(`🎁 Новый цифровой артефакт в сети! ✨`, 'success');
                const showcaseGrid = document.getElementById('globalShowcaseGrid');
                if (showcaseGrid) {
                    renderGiftCard(event.gift, showcaseGrid, true);
                }
            }
            break;
    }
}

// ==========================================
// 3D TILT EFFECT — ТОЛЬКО ДЛЯ ПРОФИЛЯ ПОЛЬЗОВАТЕЛЕЙ!
// ==========================================
function initProfileCardTilt() {
    const card = document.getElementById('profileHeroCard');
    if (!card || card._tiltInit) return;
    card._tiltInit = true;

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        const xNorm = x / width;
        const yNorm = y / height;

        const rotateX = ((yNorm - 0.5) * -7).toFixed(2);
        const rotateY = ((xNorm - 0.5) * 7).toFixed(2);

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
}

// ==========================================
// NAVIGATION (SPA SWITCHER)
// ==========================================
let currentView = 'feed';
let currentProfileUserId = null;
let currentProfileUserData = null;

function navigateTo(view, userId = null) {
    currentView = view;

    const views = ['feed', 'profile', 'showcase'];
    views.forEach(v => {
        const el = document.getElementById(`${v}View`);
        if (el) el.style.display = (v === view) ? 'block' : 'none';
    });

    const tabFeed = document.getElementById('tabNavFeed');
    const tabProfile = document.getElementById('tabNavProfile');
    const tabGifts = document.getElementById('tabNavGifts');

    if (tabFeed) tabFeed.classList.toggle('active', view === 'feed');
    if (tabProfile) tabProfile.classList.toggle('active', view === 'profile' || view === 'my-profile');
    if (tabGifts) tabGifts.classList.toggle('active', view === 'showcase');

    if (view === 'my-profile') {
        const myId = window.CURRENT_USER_ID;
        navigateTo('profile', myId);
        return;
    }

    if (view === 'profile') {
        const uid = userId || window.CURRENT_USER_ID;
        currentProfileUserId = uid;
        loadUserProfile(uid);
        window.history.pushState({}, '', `/?view=profile&user=${uid}`);
    } else if (view === 'showcase') {
        loadShowcaseGifts();
        window.history.pushState({}, '', '/?view=showcase');
    } else {
        window.history.pushState({}, '', '/');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openUserProfile(userId) {
    navigateTo('profile', userId);
}

// ==========================================
// USER PROFILE LOGIC
// ==========================================
async function loadUserProfile(userId) {
    try {
        const res = await fetch(`/api/users/${userId}/profile`);
        if (!res.ok) throw new Error('Не удалось загрузить профиль пользователя');
        const data = await res.json();
        currentProfileUserData = data.user;
        renderUserProfile(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderUserProfile(data) {
    const user = data.user;

    document.getElementById('profileBreadcrumbUser').textContent = `@${user.username}`;
    document.getElementById('heroDisplayName').textContent = user.display_name;
    document.getElementById('heroUsername').textContent = `@${user.username}`;
    document.getElementById('heroBio').textContent = user.bio || 'Информация о пользователе пока не заполнена.';
    document.getElementById('heroAvatar').src = user.avatar_url;

    // Баннер
    const banner = document.getElementById('heroBanner');
    if (user.banner_url) {
        banner.style.backgroundImage = `url('${user.banner_url}')`;
    } else {
        banner.style.backgroundImage = 'linear-gradient(135deg, #0e172a 0%, #1e1b4b 50%, #0369a1 100%)';
    }

    // Счетчики
    document.getElementById('heroStatPosts').textContent = data.posts ? data.posts.length : 0;
    document.getElementById('heroStatGifts').textContent = `🎁 ${data.gifts ? data.gifts.length : 0}`;
    document.getElementById('heroStatFollowers').textContent = data.followers ? data.followers.length : 0;
    document.getElementById('heroStatFollowing').textContent = data.following ? data.following.length : 0;

    document.getElementById('badgeProfPosts').textContent = data.posts ? data.posts.length : 0;
    document.getElementById('badgeProfGifts').textContent = data.gifts ? data.gifts.length : 0;
    document.getElementById('netFollowersCount').textContent = data.followers ? data.followers.length : 0;
    document.getElementById('netFollowingCount').textContent = data.following ? data.following.length : 0;

    // Действия в профиле
    const actionsBox = document.getElementById('heroActionsContainer');
    actionsBox.innerHTML = '';

    const profComposer = document.getElementById('profComposerCard');

    if (data.is_owner) {
        if (profComposer) profComposer.style.display = 'block';
        actionsBox.innerHTML = `
            <button class="btn btn-secondary btn-sm" onclick="openEditProfileModal()">
                <span>Редактировать</span>
            </button>
        `;
    } else {
        if (profComposer) profComposer.style.display = 'none';
        const followText = data.is_following ? 'Отписаться' : 'Подписаться';
        const followClass = data.is_following ? 'btn-following' : 'btn-primary';

        actionsBox.innerHTML = `
            <button class="btn btn-outline btn-sm" onclick="openSendGiftModal(${user.id}, '${escapeHtml(user.display_name)}', '${escapeHtml(user.username)}')">
                <span>🎁 Отправить артефакт</span>
            </button>
            <button class="btn ${followClass} btn-sm" onclick="toggleProfileFollow(${user.id})">
                <span>${followText}</span>
            </button>
        `;
    }

    renderProfilePosts(data.posts);
    renderProfileGifts(data.gifts);
    renderProfileNetwork(data.followers, data.following);

    switchProfileTab('posts');
    initProfileCardTilt();
}

async function toggleProfileFollow(userId) {
    await toggleFollow(userId);
    loadUserProfile(userId);
}

function switchProfileTab(tabName) {
    ['Posts', 'Gifts', 'Network'].forEach(t => {
        const btn = document.getElementById(`profTabBtn${t}`);
        const pane = document.getElementById(`profTabContent${t}`);
        const card = document.getElementById(`statCard${t}`);

        const isCurrent = (t.toLowerCase() === tabName.toLowerCase());
        if (btn) btn.classList.toggle('active', isCurrent);
        if (pane) pane.style.display = isCurrent ? 'block' : 'none';
        if (card) card.classList.toggle('active', isCurrent);
    });
}

function renderProfilePosts(posts) {
    const container = document.getElementById('profPostsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="cyber-empty-card">
                <span class="empty-glyph">⌁</span>
                <h3>Пока нет публикаций</h3>
                <p>Этот автор еще не разместил постов.</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const postEl = createPostElement(post);
        container.appendChild(postEl);
    });
}

function renderProfileGifts(gifts) {
    const grid = document.getElementById('profGiftsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!gifts || gifts.length === 0) {
        grid.innerHTML = `
            <div class="cyber-empty-card" style="grid-column: 1 / -1;">
                <span class="empty-glyph">🎁</span>
                <h3>Коллекция артефактов пуста</h3>
                <p>Станьте первым, кто подарит этому пользователю цифровой артефакт!</p>
                <button class="btn btn-primary btn-sm" style="margin-top: 0.8rem;" onclick="openCurrentProfileGiftModal()">
                    <span>🎁 Отправить первый артефакт</span>
                </button>
            </div>
        `;
        return;
    }

    gifts.forEach(gift => {
        renderGiftCard(gift, grid);
    });
}

function renderProfileNetwork(followers, following) {
    const fList = document.getElementById('profFollowersList');
    const foList = document.getElementById('profFollowingList');

    if (fList) {
        fList.innerHTML = (!followers || followers.length === 0) ? '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">Пока нет подписчиков</p>' : '';
        (followers || []).forEach(u => fList.appendChild(createRunnerRow(u)));
    }

    if (foList) {
        foList.innerHTML = (!following || following.length === 0) ? '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">Пока нет подписок</p>' : '';
        (following || []).forEach(u => foList.appendChild(createRunnerRow(u)));
    }
}

function createRunnerRow(u) {
    const row = document.createElement('div');
    row.className = 'runner-row';
    row.innerHTML = `
        <img src="${escapeHtml(u.avatar_url)}" alt="avatar" class="mini-avatar cursor-pointer" onclick="openUserProfile(${u.id})">
        <div class="runner-info cursor-pointer" onclick="openUserProfile(${u.id})">
            <span class="runner-name">${escapeHtml(u.display_name)}</span>
            <span class="runner-handle">@${escapeHtml(u.username)}</span>
        </div>
        <button class="btn btn-outline btn-xs ${u.is_following ? 'btn-following' : ''}" onclick="toggleFollow(${u.id})">
            ${u.is_following ? 'Читаю' : 'Читать'}
        </button>
    `;
    return row;
}

// ==========================================
// DIGITAL GIFTS SPECIFICATION & RENDERING
// ==========================================
const GIFT_SPECS = {
    supernova: { title: 'Nexus Core', rarity: 'Mythic', icon: '💠', class: 'rarity-mythic' },
    quantum_crown: { title: 'Archon Crown', rarity: 'Legendary', icon: '👑', class: 'rarity-legendary' },
    cyber_unicorn: { title: 'Synth Pegasus', rarity: 'Mythic', icon: '🦄', class: 'rarity-mythic' },
    moon_rocket: { title: 'Hyperdrive', rarity: 'Epic', icon: '🚀', class: 'rarity-epic' },
    infinite_coffee: { title: 'Neural Elixir', rarity: 'Rare', icon: '☕', class: 'rarity-rare' },
    quantum_diamond: { title: 'Chrono Prism', rarity: 'Legendary', icon: '💎', class: 'rarity-legendary' }
};

function getGiftTitle(type) {
    return (GIFT_SPECS[type] && GIFT_SPECS[type].title) || 'Цифровой артефакт';
}

function getGiftAnimationHtml(type) {
    switch (type) {
        case 'supernova':
            return '<div class="anim-core"></div>';
        case 'quantum_crown':
            return '<div class="anim-crown">👑</div>';
        case 'cyber_unicorn':
            return '<div class="anim-pegasus">🦄</div>';
        case 'moon_rocket':
            return '<div class="anim-rocket">🚀</div>';
        case 'infinite_coffee':
            return '<div class="anim-coffee">☕</div>';
        case 'quantum_diamond':
            return '<div class="anim-diamond">💎</div>';
        default:
            return '<div class="anim-core"></div>';
    }
}

function renderGiftCard(gift, container, prepend = false) {
    const spec = GIFT_SPECS[gift.gift_type] || GIFT_SPECS.supernova;
    const card = document.createElement('div');
    card.className = 'artifact-card-item';
    
    let senderText = '';
    if (gift.is_anonymous || !gift.sender) {
        senderText = 'От: <strong>Анонимный поклонник 🎭</strong>';
    } else {
        senderText = `От: <strong class="cursor-pointer" onclick="event.stopPropagation(); openUserProfile(${gift.sender.id})">@${escapeHtml(gift.sender.username)}</strong>`;
    }

    const noteHtml = gift.message ? `<div class="artifact-card-note" title="${escapeHtml(gift.message)}">«${escapeHtml(gift.message)}»</div>` : '';

    card.innerHTML = `
        <span class="artifact-rarity-pill ${spec.class}">${spec.rarity}</span>
        <div class="artifact-stage">
            ${getGiftAnimationHtml(gift.gift_type)}
        </div>
        <div class="artifact-card-title">${spec.title}</div>
        <div class="artifact-card-sender">${senderText}</div>
        ${noteHtml}
    `;

    card.addEventListener('click', () => {
        openGiftDetail(gift);
    });

    if (prepend && container.firstChild) {
        container.insertBefore(card, container.firstChild);
    } else {
        container.appendChild(card);
    }
}

// ==========================================
// SEND GIFT MODAL & FLOW
// ==========================================
function openCurrentProfileGiftModal() {
    if (currentProfileUserData) {
        openSendGiftModal(currentProfileUserData.id, currentProfileUserData.display_name, currentProfileUserData.username);
    }
}

function openSendGiftModal(receiverId, displayName, username) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт для отправки подарка 🎁', 'error');
        openAuthModal('login');
        return;
    }

    if (receiverId === window.CURRENT_USER_ID) {
        showToast('Нельзя отправить подарок самому себе 🙂', 'error');
        return;
    }

    document.getElementById('giftReceiverId').value = receiverId;
    document.getElementById('giftReceiverName').textContent = `${displayName} (@${username})`;
    document.getElementById('giftMessage').value = '';
    document.getElementById('giftIsAnonymous').checked = false;
    updateGiftCharCount();
    selectGiftType('supernova');

    const modal = document.getElementById('sendGiftModal');
    if (modal) modal.style.display = 'flex';
}

function closeSendGiftModal() {
    const modal = document.getElementById('sendGiftModal');
    if (modal) modal.style.display = 'none';
}

function selectGiftType(type) {
    document.getElementById('selectedGiftType').value = type;
    document.querySelectorAll('.gift-select-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-type') === type);
    });
    const spec = GIFT_SPECS[type] || GIFT_SPECS.supernova;
    const badge = document.getElementById('selectedRarityBadge');
    if (badge) badge.textContent = spec.rarity;
}

function updateGiftCharCount() {
    const textarea = document.getElementById('giftMessage');
    const limitEl = document.getElementById('giftCharLimit');
    if (textarea && limitEl) {
        limitEl.textContent = `${textarea.value.length} / 300`;
    }
}

async function handleSendGiftSubmit(e) {
    e.preventDefault();
    const receiverId = parseInt(document.getElementById('giftReceiverId').value, 10);
    const giftType = document.getElementById('selectedGiftType').value;
    const message = document.getElementById('giftMessage').value.trim();
    const isAnonymous = document.getElementById('giftIsAnonymous').checked;

    const btn = document.getElementById('btnSubmitGift');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Передача...</span>';
    }

    try {
        const res = await fetch('/api/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: receiverId,
                gift_type: giftType,
                message: message,
                is_anonymous: isAnonymous
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка отправки подарка');

        closeSendGiftModal();
        showToast(`🎁 Артефакт «${getGiftTitle(giftType)}» успешно вручен! ✨`, 'success');

        if (currentProfileUserId === receiverId) {
            loadUserProfile(receiverId);
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Вручить артефакт</span><span class="btn-arrow">⚡</span>';
        }
    }
}

// ==========================================
// UNBOXING / VIEW GIFT DETAIL MODAL
// ==========================================
async function openGiftDetailById(giftId) {
    try {
        const res = await fetch('/api/gifts/showcase');
        if (!res.ok) return;
        const gifts = await res.json();
        const gift = gifts.find(g => g.id === giftId);
        if (gift) openGiftDetail(gift);
    } catch (e) {}
}

function openGiftDetail(gift) {
    const modal = document.getElementById('giftDetailModal');
    if (!modal) return;

    const spec = GIFT_SPECS[gift.gift_type] || GIFT_SPECS.supernova;

    // Stage
    document.getElementById('unboxingGiftAnimation').innerHTML = getGiftAnimationHtml(gift.gift_type);
    document.getElementById('unboxingTitle').textContent = spec.title;
    const rarityEl = document.getElementById('unboxingRarity');
    rarityEl.textContent = `${spec.rarity} Artifact`;
    rarityEl.className = `unboxing-rarity ${spec.class}`;

    // Sender
    const senderAvatar = document.getElementById('unboxingSenderAvatar');
    const senderName = document.getElementById('unboxingSenderName');
    const senderHandle = document.getElementById('unboxingSenderHandle');

    if (gift.is_anonymous || !gift.sender) {
        senderAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=MysteryMask';
        senderName.textContent = 'Анонимный поклонник 🎭';
        senderHandle.textContent = '@incognito';
    } else {
        senderAvatar.src = gift.sender.avatar_url;
        senderName.textContent = gift.sender.display_name;
        senderHandle.textContent = `@${gift.sender.username}`;
    }

    // Message
    const msgBox = document.getElementById('unboxingMessageBox');
    const msgText = document.getElementById('unboxingMessageText');
    if (gift.message) {
        msgText.textContent = `«${gift.message}»`;
        msgBox.style.display = 'block';
    } else {
        msgBox.style.display = 'none';
    }

    // Date
    document.getElementById('unboxingDate').textContent = formatFullDate(gift.created_at);

    modal.style.display = 'flex';
}

function closeGiftDetailModal() {
    const modal = document.getElementById('giftDetailModal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// EDIT PROFILE MODAL
// ==========================================
function openEditProfileModal() {
    if (!currentProfileUserData) return;
    document.getElementById('editDisplayName').value = currentProfileUserData.display_name;
    document.getElementById('editBio').value = currentProfileUserData.bio || '';
    document.getElementById('editAvatar').value = currentProfileUserData.avatar_url || '';
    document.getElementById('editBanner').value = currentProfileUserData.banner_url || '';

    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'none';
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const displayName = document.getElementById('editDisplayName').value.trim();
    const bio = document.getElementById('editBio').value.trim();
    const avatarUrl = document.getElementById('editAvatar').value.trim();
    const bannerUrl = document.getElementById('editBanner').value.trim();

    try {
        const res = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                display_name: displayName,
                bio: bio,
                avatar_url: avatarUrl,
                banner_url: bannerUrl
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка обновления профиля');

        closeEditProfileModal();
        showToast('Профиль успешно обновлен! ✨', 'success');

        loadUserProfile(window.CURRENT_USER_ID);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// POST FROM PROFILE VIEW
// ==========================================
async function createProfilePost() {
    const textarea = document.getElementById('profPostContent');
    const content = textarea.value.trim();
    if (!content) {
        showToast('Введите текст публикации', 'error');
        return;
    }

    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: ''
            })
        });

        const post = await res.json();
        if (!res.ok) throw new Error(post.error || 'Ошибка публикации');

        textarea.value = '';
        showToast('Пост опубликован в ваш профиль! 🚀', 'success');

        const profPosts = document.getElementById('profPostsContainer');
        if (profPosts) {
            const empty = profPosts.querySelector('.cyber-empty-card');
            if (empty) empty.remove();
            const el = createPostElement(post);
            profPosts.insertBefore(el, profPosts.firstChild);
        }

        const stat = document.getElementById('heroStatPosts');
        if (stat) stat.textContent = parseInt(stat.textContent || '0') + 1;
        const badge = document.getElementById('badgeProfPosts');
        if (badge) badge.textContent = parseInt(badge.textContent || '0') + 1;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// SHOWCASE GIFTS GALLERY (VAULT)
// ==========================================
async function loadShowcaseGifts() {
    const grid = document.getElementById('globalShowcaseGrid');
    if (!grid) return;
    grid.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; padding: 24px; text-align: center;">Загрузка хранилища артефактов...</p>';

    try {
        const res = await fetch('/api/gifts/showcase');
        if (!res.ok) throw new Error('Ошибка загрузки артефактов');
        const gifts = await res.json();

        grid.innerHTML = '';
        if (!gifts || gifts.length === 0) {
            grid.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; padding: 24px; text-align: center;">В хранилище пока нет артефактов. Будьте первыми!</p>';
            return;
        }

        gifts.forEach(gift => {
            renderGiftCard(gift, grid);
        });
    } catch (err) {
        showToast(err.message, 'error');
    }
}
