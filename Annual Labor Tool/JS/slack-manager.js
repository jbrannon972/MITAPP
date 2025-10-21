class SlackManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.myTodos = []; // Cache for the user's todos
        this.sortOrder = 'desc'; // 'desc' for newest first, 'asc' for oldest first

        // WARNING: This is a major security risk.
        // This token should be moved to a secure backend environment (like a Google Cloud Function)
        // and not be exposed in the client-side code.
        this.SLACK_TOKEN = 'xoxp-32176058513-2858619083414-9634008270135-ce8db7a892411bc3a2bee9ffda42f4f0';
        this.CORS_PROXY = 'https://corsproxy.io/?';
    }

    initialize() {
        if (document.getElementById('slack-mentions-tab')) {
            this.setupEventListeners();
            this.checkUserRoleAndSetupUI();
            this.loadAndDisplayMentions();
        }
    }

    checkUserRoleAndSetupUI() {
        if (this.app.user.role === 'Manager') {
            document.querySelectorAll('.manager-only').forEach(el => {
                el.style.display = 'inline-flex';
            });
            this.populateSupervisorFilter();
        }
    }

    setupEventListeners() {
        const view = document.getElementById('slack-mentions-tab');
        if (!view) return;

        view.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            const checkbox = e.target.closest('.todo-checkbox-container input');

            if (button) {
                if (button.classList.contains('sub-nav-btn')) {
                    if (button.closest('#supervisor-status-filter')) {
                        // Handle the new status filter without switching the main view
                        button.closest('#supervisor-status-filter').querySelectorAll('.sub-nav-btn').forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');
                        this.loadSupervisorMentions();
                    } else {
                        this.switchView(button.dataset.view);
                    }
                }
                if (button.id === 'sync-mentions-btn') {
                    this.syncMentions();
                }
                if (button.id === 'sort-mentions-btn') {
                    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
                    if (this.sortOrder === 'desc') {
                        button.innerHTML = `<i class="fas fa-sort-amount-down"></i> Sort: Newest First`;
                    } else {
                        button.innerHTML = `<i class="fas fa-sort-amount-up"></i> Sort: Oldest First`;
                    }
                    this.displayMentions();
                }
                if (button.classList.contains('reply-btn')) {
                    this.openReplyModal(button.dataset.todoId);
                }
            }

            if (checkbox) {
                this.toggleTodo(checkbox.dataset.todoId, checkbox.checked);
            }
        });

        document.getElementById('supervisor-filter')?.addEventListener('change', () => {
            this.loadSupervisorMentions();
        });
    }

    switchView(viewName) {
        // Deactivate all views and main tab buttons first
        document.querySelectorAll('.slack-mentions-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('#slack-mentions-tab > .tab-header > .sub-nav .sub-nav-btn').forEach(b => b.classList.remove('active'));
    
        // Activate the selected view and its corresponding main tab button
        const viewEl = document.getElementById(`${viewName}-view`);
        if (viewEl) {
            viewEl.classList.add('active');
        }
        const activeBtn = document.querySelector(`#slack-mentions-tab > .tab-header > .sub-nav .sub-nav-btn[data-view="${viewName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Refresh the content of the newly active view
        if (viewName === 'supervisors') {
            this.loadSupervisorMentions();
        } else if (viewName === 'reports') {
            this.loadReportsView();
        } else {
            this.displayMentions();
        }
    }

    async loadAndDisplayMentions() {
        const pendingContainer = document.getElementById('pending-mentions-container');
        const completedContainer = document.getElementById('completed-mentions-container');
        pendingContainer.innerHTML = '<p>Loading your mentions...</p>';
        completedContainer.innerHTML = '<p>Loading completed mentions...</p>';

        const user = this.app.user;
        const allStaff = this.app.teamManager.getAllTechnicians();
        const currentUser = allStaff.find(staff => staff.id === user.userId);

        if (!currentUser || !currentUser.slackId) {
            const errorMessage = '<p class="text-danger" style="color: var(--danger-color);">Your Slack User ID is not set in your profile. Please ask a manager to add it in the Team Management section.</p>';
            pendingContainer.innerHTML = errorMessage;
            completedContainer.innerHTML = errorMessage;
            return;
        }

        try {
            this.myTodos = await this.app.firebaseService.getTodosByUserId(currentUser.slackId);
            this.displayMentions();
        } catch (error) {
            const errorMessage = `<p class="text-danger" style="color: var(--danger-color);">Error loading mentions: ${error.message}</p>`;
            pendingContainer.innerHTML = errorMessage;
            completedContainer.innerHTML = errorMessage;
        }
    }
    
    displayMentions() {
        const pendingContainer = document.getElementById('pending-mentions-container');
        const completedContainer = document.getElementById('completed-mentions-container');

        const pendingTodos = this.myTodos.filter(todo => !todo.completed);
        const completedTodos = this.myTodos.filter(todo => todo.completed);
        
        pendingTodos.sort((a, b) => {
            if (this.sortOrder === 'desc') {
                return new Date(b.timestamp) - new Date(a.timestamp); // Newest first
            } else {
                return new Date(a.timestamp) - new Date(b.timestamp); // Oldest first
            }
        });
        completedTodos.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

        if (pendingTodos.length === 0) {
            pendingContainer.innerHTML = '<p style="font-weight: 500;">✅ You\'re all caught up!</p>';
        } else {
            pendingContainer.innerHTML = pendingTodos.map(todo => this.createTodoHTML(todo)).join('');
        }

        if (completedTodos.length === 0) {
            completedContainer.innerHTML = '<p>No mentions completed yet.</p>';
        } else {
            completedContainer.innerHTML = completedTodos.map(todo => this.createTodoHTML(todo)).join('');
        }
    }

    async loadSupervisorMentions() {
        const container = document.getElementById('supervisor-mentions-container');
        container.innerHTML = '<p>Loading supervisor mentions...</p>';
        const selectedSupervisorId = document.getElementById('supervisor-filter').value;
        const statusFilterEl = document.querySelector('#supervisor-status-filter .sub-nav-btn.active');
        const statusFilter = statusFilterEl ? statusFilterEl.dataset.status : 'pending'; // Default to 'pending'

        try {
            const allTodos = await this.app.firebaseService.getAllTodos();
            
            let supervisorTodos;
            if (selectedSupervisorId === 'all') {
                const allStaff = this.app.teamManager.getAllTechnicians();
                const supervisors = allStaff.filter(s => s.role === 'Supervisor' || s.role === 'MIT Lead');
                const supervisorSlackIds = new Set(supervisors.map(s => s.slackId).filter(Boolean));
                supervisorTodos = allTodos.filter(todo => supervisorSlackIds.has(todo.userId));
            } else {
                supervisorTodos = allTodos.filter(todo => todo.userId === selectedSupervisorId);
            }
            
            const todosByUser = {};
            supervisorTodos.forEach(data => {
                if (!todosByUser[data.userId]) {
                    todosByUser[data.userId] = { user: data, todos: [] };
                }
                todosByUser[data.userId].todos.push(data);
            });

            if (Object.keys(todosByUser).length === 0) {
                container.innerHTML = '<p>✅ No mentions found for the selected supervisor(s).</p>';
                return;
            }

            let html = '';
            const sortedUserIds = Object.keys(todosByUser).sort((a, b) => 
                todosByUser[a].user.userName.localeCompare(todosByUser[b].user.userName)
            );

            for (const userId of sortedUserIds) {
                const userData = todosByUser[userId];
                // Filter the todos based on the selected status
                const filteredTodos = userData.todos.filter(t => (statusFilter === 'completed' ? t.completed : !t.completed));

                if (filteredTodos.length > 0) {
                    filteredTodos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Always newest first for this view
                    
                    const pendingCount = userData.todos.filter(t => !t.completed).length;
                    html += `
                        <div class="card" style="margin-bottom: 20px;">
                            <div class="card-header">
                                <h3>${userData.user.userName}</h3>
                                <span class="pending-count">${pendingCount} Pending</span>
                            </div>
                            <div class="card-body">
                                ${filteredTodos.map(todo => this.createTodoHTML(todo, true)).join('')}
                            </div>
                        </div>
                    `;
                }
            }

            if (html === '') {
                 container.innerHTML = `<p>No ${statusFilter} mentions found for the selected supervisor(s).</p>`;
            } else {
                container.innerHTML = html;
            }

        } catch (error) {
            container.innerHTML = `<p class="text-danger" style="color: var(--danger-color);">Error loading mentions: ${error.message}</p>`;
        }
    }

    async loadReportsView() {
        const container = document.getElementById('supervisor-reports-container');
        container.innerHTML = '<p>Calculating average response times...</p>';

        try {
            const allStaff = this.app.teamManager.getAllTechnicians();
            const supervisors = allStaff.filter(s => s.role === 'Supervisor' || s.role === 'MIT Lead');
            const supervisorSlackIds = new Set(supervisors.map(s => s.slackId).filter(Boolean));

            const allTodos = await this.app.firebaseService.getAllTodos();
            const completedSupervisorTodos = allTodos.filter(todo => supervisorSlackIds.has(todo.userId) && todo.completed && todo.completedAt);
            
            const reportData = {};

            completedSupervisorTodos.forEach(todo => {
                if (!reportData[todo.userId]) {
                    reportData[todo.userId] = {
                        name: todo.userName,
                        totalResponseTime: 0,
                        count: 0
                    };
                }
                const mentionTime = new Date(todo.timestamp).getTime();
                const completedTime = new Date(todo.completedAt).getTime();
                const responseTime = completedTime - mentionTime;
                
                reportData[todo.userId].totalResponseTime += responseTime;
                reportData[todo.userId].count++;
            });

            if (Object.keys(reportData).length === 0) {
                container.innerHTML = '<p>No completed mentions with response times found for any supervisors.</p>';
                return;
            }
            
            let tableHtml = `
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Supervisor</th>
                                <th>Mentions Completed</th>
                                <th>Average Response Time</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            for (const userId in reportData) {
                const data = reportData[userId];
                const avgResponseTime = data.totalResponseTime / data.count;
                tableHtml += `
                    <tr>
                        <td>${data.name}</td>
                        <td>${data.count}</td>
                        <td>${this.formatDuration(avgResponseTime)}</td>
                    </tr>
                `;
            }

            tableHtml += '</tbody></table></div>';
            container.innerHTML = tableHtml;

        } catch(error) {
             container.innerHTML = `<p class="text-danger" style="color: var(--danger-color);">Error generating report: ${error.message}</p>`;
        }
    }

    populateSupervisorFilter() {
        const filter = document.getElementById('supervisor-filter');
        if (!filter) return;
        
        const allStaff = this.app.teamManager.getAllTechnicians();
        const supervisors = allStaff.filter(s => s.role === 'Supervisor' || s.role === 'MIT Lead');
        
        let optionsHtml = '<option value="all">All Supervisors</option>';
        supervisors.sort((a,b) => a.name.localeCompare(b.name)).forEach(sup => {
            optionsHtml += `<option value="${sup.slackId}">${sup.name}</option>`;
        });
        filter.innerHTML = optionsHtml;
    }
    
    formatDuration(ms) {
        if (ms < 0) return 'N/A';
        let seconds = Math.floor(ms / 1000);
        let minutes = Math.floor(seconds / 60);
        let hours = Math.floor(minutes / 60);
        let days = Math.floor(hours / 24);

        hours = hours % 24;
        minutes = minutes % 60;
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${Math.floor(seconds)}s`;
    }

    convertSlackEmoji(text) {
        const emojiMap = {
            ':point_up:': '☝️',
            ':thumbsup:': '👍',
            ':smile:': '😄',
            ':eyes:': '👀',
            ':white_check_mark:': '✅',
            ':warning:': '⚠️',
        };
        const emojiRegex = /:([a-zA-Z0-9_+-]+):(?::skin-tone-\d:)?/g;
        return text.replace(emojiRegex, (match, emojiName) => {
            const fullMatch = `:${emojiName}:`;
            return emojiMap[fullMatch] || match;
        });
    }

    createTodoHTML(todo, isManagerView = false) {
        let cleanedText = todo.text.replace(/<@U[A-Z0-9]+\|([^>]+)>/g, '@$1');
        cleanedText = this.convertSlackEmoji(cleanedText);
    
        const timestamp = new Date(todo.timestamp);
        const formattedDate = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        // Check if the mention is over 24 hours old and not completed
        const isOverdue = !todo.completed && (new Date() - timestamp) > (24 * 60 * 60 * 1000);
    
        const checkboxHtml = isManagerView ? 
            `<input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} disabled>` :
            `<input type="checkbox" class="todo-checkbox" data-todo-id="${todo.id}" ${todo.completed ? 'checked' : ''}>`;

        const replyButtonHtml = !todo.completed && !isManagerView ?
            `<button class="btn btn-secondary btn-small reply-btn" data-todo-id="${todo.id}"><i class="fas fa-reply"></i> Reply</button>` : '';

        return `
            <div class="todo-item ${todo.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}">
                <label class="todo-checkbox-container">
                    ${checkboxHtml}
                    <span class="checkmark"></span>
                </label>
                <div class="todo-content">
                    <div class="todo-header">
                        <span class="job-number">#${todo.channel}</span>
                        <span class="from-user">from @${todo.from}</span>
                    </div>
                    <p class="todo-text">${cleanedText}</p>
                    <div class="todo-meta">
                        <span>Mentioned: ${formattedDate}</span>
                        <div class="todo-actions">
                            ${replyButtonHtml}
                            <a href="${todo.permalink}" target="_blank" rel="noopener noreferrer" class="todo-link">
                                View in Slack <i class="fas fa-external-link-alt fa-xs"></i>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async syncMentions() {
        const activeView = document.querySelector('.slack-mentions-view.active').id;
    
        if (activeView === 'supervisors-view' && this.app.user.role === 'Manager') {
            await this.syncAllSupervisors();
        } else {
            await this.syncCurrentUser();
        }
    }
    
    async syncCurrentUser() {
        this.app.modalManager.showModal('Syncing Mentions', '<p>Fetching your unanswered mentions from Slack...</p>', []);
        try {
            const allStaff = this.app.teamManager.getAllTechnicians();
            const user = this.app.user;
            const currentUser = allStaff.find(staff => staff.id === user.userId);
            if (!currentUser || !currentUser.slackId) {
                throw new Error("Your Slack ID is not set in your profile.");
            }
            const mentions = await this.getUnansweredMentions(currentUser.slackId);
            let totalAdded = 0;
            let totalSkipped = 0;
            for (const mention of mentions) {
                const todoId = btoa(mention.permalink).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
                const todoExists = await this.app.firebaseService.checkTodoExists(todoId);
                if (!todoExists) {
                    const todoData = {
                        userId: currentUser.slackId,
                        userName: currentUser.name,
                        userUsername: mention.from,
                        channel: mention.channel,
                        from: mention.from,
                        text: mention.text,
                        permalink: mention.permalink,
                        timestamp: mention.timestamp,
                        completed: false,
                        createdAt: new Date().toISOString()
                    };
                    await this.app.firebaseService.createTodo(todoId, todoData);
                    totalAdded++;
                } else {
                    totalSkipped++;
                }
            }
            this.app.modalManager.showModal('Sync Complete', `<p>Added ${totalAdded} new mentions, skipped ${totalSkipped} duplicates.</p>`, [{
                text: 'Close',
                class: 'btn-secondary',
                onclick: 'laborTool.modalManager.closeModal(); laborTool.slackManager.loadAndDisplayMentions();'
            }]);
        } catch (error) {
            this.app.modalManager.showModal('Sync Error', `<p class="text-danger" style="color: var(--danger-color);">Error: ${error.message}</p>`, [{
                text: 'Close',
                class: 'btn-secondary',
                onclick: 'laborTool.modalManager.closeModal()'
            }]);
            console.error(error);
        }
    }
    
    async syncAllSupervisors() {
        this.app.modalManager.showModal('Syncing All Supervisors', '<p>Fetching mentions for all supervisors. This may take a moment...</p>', []);
        let totalAdded = 0;
        let totalSkipped = 0;
        let errors = [];

        try {
            const allStaff = this.app.teamManager.getAllTechnicians();
            const supervisors = allStaff.filter(s => (s.role === 'Supervisor' || s.role === 'MIT Lead') && s.slackId);

            for (const supervisor of supervisors) {
                try {
                    const mentions = await this.getUnansweredMentions(supervisor.slackId);
                    for (const mention of mentions) {
                        const todoId = btoa(mention.permalink).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
                        const todoExists = await this.app.firebaseService.checkTodoExists(todoId);
                        if (!todoExists) {
                            const todoData = {
                                userId: supervisor.slackId,
                                userName: supervisor.name,
                                channel: mention.channel,
                                from: mention.from,
                                text: mention.text,
                                permalink: mention.permalink,
                                timestamp: mention.timestamp,
                                completed: false,
                                createdAt: new Date().toISOString()
                            };
                            await this.app.firebaseService.createTodo(todoId, todoData);
                            totalAdded++;
                        } else {
                            totalSkipped++;
                        }
                    }
                } catch (userError) {
                    errors.push(`Could not sync for ${supervisor.name}: ${userError.message}`);
                }
            }

            let resultMessage = `<p>Sync complete for all supervisors.</p><p>Added ${totalAdded} new mentions, skipped ${totalSkipped} duplicates.</p>`;
            if (errors.length > 0) {
                resultMessage += `<div class="status-error" style="margin-top: 1rem; padding: 0.5rem;"><h4>Errors:</h4><p>${errors.join('<br>')}</p></div>`;
            }
            
            this.app.modalManager.showModal('Sync Complete', resultMessage, [{
                text: 'Close',
                class: 'btn-secondary',
                onclick: 'laborTool.modalManager.closeModal(); laborTool.slackManager.loadSupervisorMentions();'
            }]);

        } catch (error) {
            this.app.modalManager.showModal('Sync Error', `<p class="text-danger" style="color: var(--danger-color);">A critical error occurred: ${error.message}</p>`, [{
                text: 'Close',
                class: 'btn-secondary',
                onclick: 'laborTool.modalManager.closeModal()'
            }]);
            console.error(error);
        }
    }

    async toggleTodo(todoId, completed) {
        try {
            await this.app.firebaseService.updateTodo(todoId, {
                completed: completed,
                completedAt: completed ? new Date().toISOString() : null
            });
            const todo = this.myTodos.find(t => t.id === todoId);
            if(todo) {
                todo.completed = completed;
                todo.completedAt = completed ? new Date().toISOString() : null;
            }
            this.displayMentions();
        } catch (error) {
            alert('Error updating to-do: ' + error.message);
        }
    }
    
    async slackApiCall(endpoint, params = {}, method = 'POST', body = null) {
        const url = new URL(`https://slack.com/api/${endpoint}`);
        if (method === 'GET') {
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        }
        const proxiedUrl = this.CORS_PROXY + url.toString();
        const options = {
            method: method,
            headers: {
                'Authorization': `Bearer ${this.SLACK_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(proxiedUrl, options);
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'Slack API error');
        return data;
    }

    async getUnansweredMentions(userId) {
        const hours = 72;
        const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000);
        const oldest = Math.floor(timeThreshold.getTime() / 1000);
        const data = await this.slackApiCall('search.messages', {
            query: `<@${userId}>`,
            sort: 'timestamp',
            sort_dir: 'desc',
            count: 100
        }, 'GET');
        const messages = (data.messages?.matches || []).filter(msg => parseFloat(msg.ts) >= oldest);
        const unanswered = [];
        for (const mention of messages) {
            if (mention.user === userId) continue;
            const hasResponded = await this.checkThreadReplies(mention.channel.id, mention.ts, userId);
            if (!hasResponded) {
                unanswered.push({
                    channel: mention.channel.name || 'Unknown',
                    from: mention.username || 'Unknown',
                    text: mention.text,
                    permalink: mention.permalink,
                    timestamp: new Date(parseFloat(mention.ts) * 1000).toISOString()
                });
            }
        }
        return unanswered;
    }

    async checkThreadReplies(channelId, threadTs, userId) {
        try {
            const data = await this.slackApiCall('conversations.replies', {
                channel: channelId,
                ts: threadTs,
                limit: 200
            }, 'GET');
            return (data.messages || []).some(msg => msg.user === userId && msg.ts !== threadTs);
        } catch (error) {
            console.error('Error checking thread replies:', error);
            return false;
        }
    }

    openReplyModal(todoId) {
        const todo = this.myTodos.find(t => t.id === todoId);
        if (!todo) {
            alert("Could not find the to-do item.");
            return;
        }
        const modalBody = `
            <div class="form-group">
                <label for="slackReplyText">Your Reply</label>
                <textarea id="slackReplyText" class="form-input" rows="5" placeholder="Type your message here..."></textarea>
            </div>
        `;
        this.app.modalManager.showModal(`Reply to @${todo.from}`, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Send Reply', class: 'btn-primary', onclick: `laborTool.slackManager.sendSlackReply('${todoId}')` }
        ]);
        document.getElementById('slackReplyText').focus();
    }

    async sendSlackReply(todoId) {
        const todo = this.myTodos.find(t => t.id === todoId);
        const replyText = document.getElementById('slackReplyText').value.trim();
        if (!replyText) {
            alert("Please enter a reply message.");
            return;
        }
        const permalinkParts = todo.permalink.match(/archives\/(C[A-Z0-9]+)\/p(\d+)/);
        if (!permalinkParts) {
            alert("Could not parse Slack link. Unable to send reply.");
            return;
        }
        const channelId = permalinkParts[1];
        const threadTs = permalinkParts[2].slice(0, 10) + '.' + permalinkParts[2].slice(10);
        this.app.modalManager.showModal('Sending Reply', '<p>Please wait...</p>', []);
        try {
            await this.slackApiCall('chat.postMessage', {}, 'POST', {
                channel: channelId,
                text: replyText,
                thread_ts: threadTs
            });
            await this.toggleTodo(todoId, true);
            this.app.modalManager.showModal('Success', '<p>Your reply has been sent and the item has been marked as complete.</p>', [
                { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
            ]);
        } catch (error) {
            this.app.modalManager.showModal('Error', `<p class="text-danger">Failed to send reply: ${error.message}</p>`, [
                 { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
            ]);
        }
    }
}