// ===== KANBAN PRO - SISTEMA DE GERENCIAMENTO DE TAREFAS =====

class KanbanApp {
    constructor() {
        // Dados do sistema
        this.columns = [];
        this.tasks = [];
        this.draggedTask = null;
        this.isEditMode = false;
        this.editingTaskId = null;
        
        // Categorias personalizadas
        this.customCategories = this.loadCustomCategories();
        
        // Filtros
        this.currentFilter = {
            priorities: [],
            categories: [],
            search: ''
        };

        this.init();
    }

    // Carregar categorias personalizadas do localStorage
    loadCustomCategories() {
        const saved = localStorage.getItem('kanban_custom_categories');
        return saved ? JSON.parse(saved) : [];
    }

    // Salvar categorias personalizadas no localStorage
    saveCustomCategories() {
        localStorage.setItem('kanban_custom_categories', JSON.stringify(this.customCategories));
    }

    // Inicialização do sistema
    async init() {
        try {
            await this.loadColumns();
            await this.loadTasks();
            this.updateCategorySelects(); // Carregar categorias personalizadas
            this.renderBoard();
            this.bindEvents();
            this.updateStats();
            this.showToast('Sistema Kanban carregado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao inicializar:', error);
            this.showToast('Erro ao carregar o sistema', 'error');
        }
    }

    // Carregar colunas do banco de dados
    // Carregar colunas do banco de dados
async loadColumns() {
    try {
        const response = await fetch('tables/kanban_columns?sort=position');
        const data = await response.json();
        this.columns = data.data;
    } catch (error) {
        console.error('Erro ao carregar colunas:', error);
        // Colunas padrão caso haja erro
        this.columns = [
            { id: 'todo', title: 'A Fazer', position: 1, color: '#64748b', is_active: true },
            { id: 'in_progress', title: 'Em Progresso', position: 2, color: '#f59e0b', is_active: true },
            { id: 'done', title: 'Concluído', position: 3, color: '#10b981', is_active: true }
        ];
    }
}


    // Carregar tarefas do banco de dados
    async loadTasks() {
        try {
            const response = await fetch('tables/tasks?sort=position');
            const data = await response.json();
            this.tasks = data.data;
        } catch (error) {
            console.error('Erro ao carregar tarefas:', error);
            this.tasks = [];
        }
    }

    // Renderizar o quadro Kanban
    renderBoard() {
        const board = document.getElementById('kanbanBoard');
        board.innerHTML = '';

        this.columns.forEach(column => {
            const columnElement = this.createColumnElement(column);
            board.appendChild(columnElement);
        });
    }

    // Criar elemento de coluna
    createColumnElement(column) {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'kanban-column';
        columnDiv.dataset.columnId = column.id;

        const tasks = this.getFilteredTasks(column.id);

        columnDiv.innerHTML = `
            <div class="column-header">
                <h3 class="column-title">${column.title}</h3>
                <span class="column-count">${tasks.length}</span>
            </div>
            <div class="kanban-tasks" data-column-id="${column.id}">
                ${tasks.map(task => this.createTaskElement(task)).join('')}
            </div>
            <button class="add-task-btn" onclick="app.openTaskModal('${column.id}')">
                <i class="fas fa-plus"></i> Adicionar tarefa
            </button>
        `;

        // Configurar drag and drop
        const tasksContainer = columnDiv.querySelector('.kanban-tasks');
        tasksContainer.addEventListener('dragover', this.handleDragOver.bind(this));
        tasksContainer.addEventListener('drop', this.handleDrop.bind(this));
        tasksContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));

        return columnDiv;
    }

    // Criar elemento de tarefa
    createTaskElement(task) {
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Determinar status do prazo
        let statusBadge = '';
        let statusClass = '';
        let statusIcon = '';
        
        if (task.column_id === 'done') {
            statusBadge = 'Concluída';
            statusClass = 'on-time';
            statusIcon = 'fa-check-circle';
        } else if (dueDate) {
            const dueDateOnly = new Date(dueDate);
            dueDateOnly.setHours(0, 0, 0, 0);
            
            if (dueDateOnly < today) {
                statusBadge = 'Em Atraso';
                statusClass = 'overdue';
                statusIcon = 'fa-exclamation-circle';
            } else {
                statusBadge = 'No Prazo';
                statusClass = 'on-time';
                statusIcon = 'fa-clock';
            }
        } else {
            statusBadge = 'Sem Prazo';
            statusClass = 'no-date';
            statusIcon = 'fa-calendar-times';
        }
        
        const isOverdue = dueDate && dueDate < today && task.column_id !== 'done';
        const priorityClass = `priority-${task.priority}`;
        const categoryLabel = this.getCategoryLabel(task.category);

        return `
            <div class="task-card ${isOverdue ? 'overdue' : ''}" 
                 draggable="true" 
                 data-task-id="${task.id}"
                 data-column-id="${task.column_id}">
                <div class="task-header">
                    <div>
                        <h4 class="task-title">${this.escapeHtml(task.title)}</h4>
                        ${task.description ? `<p class="task-description">${this.escapeHtml(task.description)}</p>` : ''}
                    </div>
                    <div class="task-actions">
                        <button class="task-btn" onclick="app.editTask('${task.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="task-btn" onclick="app.deleteTask('${task.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="task-meta">
                    <span class="task-priority ${priorityClass}">${this.getPriorityLabel(task.priority)}</span>
                    <span class="task-category">${categoryLabel}</span>
                </div>
                <div class="task-meta" style="margin-top: 0.5rem;">
                    <span class="task-status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        ${statusBadge}
                    </span>
                    ${dueDate ? `
                        <span class="task-due-date ${isOverdue ? 'overdue' : ''}">
                            <i class="fas fa-calendar"></i>
                            ${dueDate.toLocaleDateString('pt-BR')}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Obter tarefas filtradas
    getFilteredTasks(columnId) {
        let filteredTasks = this.tasks.filter(task => task.column_id === columnId);

        // Filtrar por prioridade
        if (this.currentFilter.priorities.length > 0) {
            filteredTasks = filteredTasks.filter(task => 
                this.currentFilter.priorities.includes(task.priority)
            );
        }

        // Filtrar por categoria
        if (this.currentFilter.categories.length > 0) {
            filteredTasks = filteredTasks.filter(task => 
                this.currentFilter.categories.includes(task.category)
            );
        }

        // Filtrar por busca
        if (this.currentFilter.search) {
            const searchTerm = this.currentFilter.search.toLowerCase();
            filteredTasks = filteredTasks.filter(task => 
                task.title.toLowerCase().includes(searchTerm) ||
                (task.description && task.description.toLowerCase().includes(searchTerm))
            );
        }

        // Ordenar por posição
        return filteredTasks.sort((a, b) => a.position - b.position);
    }

    // Eventos de drag and drop
    handleDragStart(e) {
        if (e.target.classList.contains('task-card')) {
            this.draggedTask = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.outerHTML);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (e.target.classList.contains('kanban-tasks')) {
            e.target.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains('kanban-tasks')) {
            e.target.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        
        if (e.target.classList.contains('kanban-tasks')) {
            e.target.classList.remove('drag-over');
            
            const newColumnId = e.target.dataset.columnId;
            const taskId = this.draggedTask.dataset.taskId;
            
            this.moveTask(taskId, newColumnId);
        }
    }

    handleDragEnd(e) {
        if (e.target.classList.contains('task-card')) {
            e.target.classList.remove('dragging');
        }
        
        // Remover classes de drag-over de todos os containers
        document.querySelectorAll('.kanban-tasks').forEach(container => {
            container.classList.remove('drag-over');
        });
    }

    // Mover tarefa entre colunas
    async moveTask(taskId, newColumnId) {
        try {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task || task.column_id === newColumnId) return;

            // Atualizar no backend
            const updatedTask = {
                ...task,
                column_id: newColumnId,
                updated_at: Date.now()
            };

            await fetch(`tables/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedTask)
            });

            // Atualizar localmente
            task.column_id = newColumnId;
            task.updated_at = updatedTask.updated_at;

            // Re-renderizar o quadro
            this.renderBoard();
            this.updateStats();
            
            this.showToast('Tarefa movida com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao mover tarefa:', error);
            this.showToast('Erro ao mover tarefa', 'error');
        }
    }

    // Abrir modal de tarefa
    openTaskModal(columnId = null) {
        this.isEditMode = false;
        this.editingTaskId = null;
        document.getElementById('modalTitle').textContent = 'Nova Tarefa';
        document.getElementById('taskForm').reset();
        
        // Armazenar coluna selecionada para novas tarefas
        this.selectedColumnForNewTask = columnId;
        
        document.getElementById('taskModal').classList.add('active');
    }

    // Editar tarefa existente
    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.isEditMode = true;
        this.editingTaskId = taskId;
        
        document.getElementById('modalTitle').textContent = 'Editar Tarefa';
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskCategory').value = task.category;
        
        // Definir data de vencimento se existir
        if (task.due_date) {
            const date = new Date(task.due_date);
            document.getElementById('taskDueDate').value = date.toISOString().split('T')[0];
        }
        
        document.getElementById('taskModal').classList.add('active');
    }

    // Fechar modal de tarefa
    closeTaskModal() {
        document.getElementById('taskModal').classList.remove('active');
        document.getElementById('taskForm').reset();
        this.isEditMode = false;
        this.editingTaskId = null;
        this.selectedColumnForNewTask = null;
    }

    // Salvar tarefa (criar ou editar)
    async saveTask(taskData) {
        try {
            if (this.isEditMode) {
                // Atualizar tarefa existente
                const task = this.tasks.find(t => t.id === this.editingTaskId);
                const updatedTask = { ...task, ...taskData };

                await fetch(`tables/tasks/${this.editingTaskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedTask)
                });
                
                // Atualizar localmente
                Object.assign(task, taskData);
                this.showToast('Tarefa atualizada com sucesso!', 'success');
            } else {
                // Criar nova tarefa
                const newTask = {
                    id: this.generateId(),
                    title: taskData.title,
                    description: taskData.description,
                    priority: taskData.priority,
                    category: taskData.category,
                    due_date: taskData.due_date,
                    column_id: this.selectedColumnForNewTask || 'todo',
                    position: this.tasks.length,
                    created_at: Date.now(),
                    updated_at: Date.now()
                };

                await fetch('tables/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newTask)
                });
                
                this.tasks.push(newTask);
                this.showToast('Tarefa criada com sucesso!', 'success');
            }

            this.closeTaskModal();
            this.renderBoard();
            this.updateStats();
        } catch (error) {
            console.error('Erro ao salvar tarefa:', error);
            this.showToast('Erro ao salvar tarefa', 'error');
        }
    }

    // Excluir tarefa
    async deleteTask(taskId) {
        if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;

        try {
            await fetch(`tables/tasks/${taskId}`, {
                method: 'DELETE'
            });

            // Remover localmente
            this.tasks = this.tasks.filter(t => t.id !== taskId);

            this.renderBoard();
            this.updateStats();
            this.showToast('Tarefa excluída com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao excluir tarefa:', error);
            this.showToast('Erro ao excluir tarefa', 'error');
        }
    }

    // Atualizar estatísticas
    updateStats() {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(t => t.column_id === 'done').length;
        const pendingTasks = this.tasks.filter(t => t.column_id !== 'done').length;

        document.getElementById('totalTasks').textContent = totalTasks;
        document.getElementById('completedTasks').textContent = completedTasks;
        document.getElementById('pendingTasks').textContent = pendingTasks;
    }

    // Vincular eventos
    bindEvents() {
        // Modal de tarefa
        document.getElementById('addTaskBtn').addEventListener('click', () => this.openTaskModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeTaskModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeTaskModal());
        
        // Gerenciar categoria personalizada
        document.getElementById('taskCategory').addEventListener('change', (e) => {
            const customGroup = document.getElementById('customCategoryGroup');
            if (e.target.value === 'custom') {
                customGroup.style.display = 'block';
                document.getElementById('customCategory').focus();
            } else {
                customGroup.style.display = 'none';
            }
        });

        document.getElementById('cancelCustomCategory').addEventListener('click', () => {
            document.getElementById('customCategoryGroup').style.display = 'none';
            document.getElementById('taskCategory').value = 'rescisao';
            document.getElementById('customCategory').value = '';
        });

        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            let category = document.getElementById('taskCategory').value;
            
            // Se for categoria personalizada
            if (category === 'custom') {
                const customCategoryName = document.getElementById('customCategory').value.trim();
                if (!customCategoryName) {
                    this.showToast('Digite o nome da nova categoria', 'error');
                    return;
                }
                
                // Criar ID para a categoria
                const categoryId = customCategoryName.toLowerCase().replace(/\s+/g, '_');
                
                // Adicionar à lista de categorias personalizadas se não existir
                if (!this.customCategories.find(c => c.id === categoryId)) {
                    this.customCategories.push({
                        id: categoryId,
                        name: customCategoryName
                    });
                    this.saveCustomCategories();
                    this.updateCategorySelects();
                }
                
                category = categoryId;
            }
            
            this.saveTask({
                title: document.getElementById('taskTitle').value.trim(),
                description: document.getElementById('taskDescription').value.trim(),
                priority: document.getElementById('taskPriority').value,
                category: category,
                due_date: document.getElementById('taskDueDate').value ? new Date(document.getElementById('taskDueDate').value).toISOString() : null,
                updated_at: Date.now()
            });
        });

        // Modal de filtros
        document.getElementById('filterBtn').addEventListener('click', () => this.openFilterModal());
        document.getElementById('closeFilterModal').addEventListener('click', () => this.closeFilterModal());
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());

        // Busca
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.currentFilter.search = e.target.value;
            this.renderBoard();
        });

        // View options
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.changeView(e.target.dataset.view));
        });

        // Drag and drop global
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));

        // Fechar modais ao clicar fora
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeTaskModal();
                this.closeFilterModal();
            }
        });
    }

    // Abrir modal de filtros
    openFilterModal() {
        document.getElementById('filterModal').classList.add('active');
    }

    // Fechar modal de filtros
    closeFilterModal() {
        document.getElementById('filterModal').classList.remove('active');
    }

    // Aplicar filtros
    applyFilters() {
        this.currentFilter.priorities = Array.from(document.querySelectorAll('.priority-filter:checked')).map(cb => cb.value);
        this.currentFilter.categories = Array.from(document.querySelectorAll('.category-filter:checked')).map(cb => cb.value);
        
        this.renderBoard();
        this.closeFilterModal();
        this.showToast('Filtros aplicados', 'success');
    }

    // Limpar filtros
    clearFilters() {
        document.querySelectorAll('.priority-filter, .category-filter').forEach(cb => cb.checked = false);
        this.currentFilter.priorities = [];
        this.currentFilter.categories = [];
        this.renderBoard();
        this.showToast('Filtros limpos', 'success');
    }

    // Mudar visualização
    changeView(view) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        // Implementar diferentes visualizações se necessário
        this.showToast(`Visualização ${view === 'board' ? 'Board' : 'Lista'} ativada`, 'success');
    }

    // Mostrar notificação toast
    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        
        toast.innerHTML = `
            <i class="fas ${icon} toast-icon"></i>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remover após 5 segundos
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    // Utilitários
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getPriorityLabel(priority) {
        const labels = {
            low: 'Baixa',
            medium: 'Média',
            high: 'Alta'
        };
        return labels[priority] || priority;
    }

    getCategoryLabel(category) {
        const labels = {
            rescisao: 'Rescisão',
            folha_pagamento: 'Folha de Pagamento',
            recibos_avulsos: 'Recibos Avulsos',
            consultar_debitos_ferias: 'Consultar Débitos / Férias',
            consultar_saldo_fgts: 'Consultar Saldo FGTS',
            registro: 'Registro'
        };
        
        // Verificar se é categoria personalizada
        const customCategory = this.customCategories.find(c => c.id === category);
        if (customCategory) {
            return customCategory.name;
        }
        
        return labels[category] || category;
    }

    // Atualizar selects de categoria com categorias personalizadas
    updateCategorySelects() {
        const taskCategorySelect = document.getElementById('taskCategory');
        const filterCategoryList = document.getElementById('categoryFilterList');
        
        // Atualizar select do formulário
        const customOption = taskCategorySelect.querySelector('option[value="custom"]');
        
        // Remover categorias personalizadas antigas
        taskCategorySelect.querySelectorAll('option.custom-category').forEach(opt => opt.remove());
        
        // Adicionar categorias personalizadas
        this.customCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            option.className = 'custom-category';
            taskCategorySelect.insertBefore(option, customOption);
        });
        
        // Atualizar filtros
        filterCategoryList.querySelectorAll('.custom-category-filter').forEach(el => el.remove());
        
        this.customCategories.forEach(cat => {
            const label = document.createElement('label');
            label.className = 'custom-category-filter';
            label.innerHTML = `<input type="checkbox" value="${cat.id}" class="category-filter"> ${cat.name}`;
            filterCategoryList.appendChild(label);
        });
    }
}

// Inicializar a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.app = new KanbanApp();
});