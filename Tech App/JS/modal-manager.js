class ModalManager {
    constructor(app) {
        this.app = app;
        this.modalOverlay = document.getElementById('modalOverlay');
        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay || e.target.closest('.modal-close')) {
                    this.closeModal();
                }
            });
        }
    }

    showModal(title, body, buttons) {
        if (!this.modalOverlay) return;
        this.modalOverlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">${body}</div>
                <div class="modal-footer"></div>
            </div>
        `;
        const modalFooter = this.modalOverlay.querySelector('.modal-footer');
        buttons.forEach(btnInfo => {
            const buttonEl = document.createElement('button');
            buttonEl.className = `btn ${btnInfo.class}`;
            buttonEl.innerHTML = btnInfo.text;
            buttonEl.addEventListener('click', () => new Function(btnInfo.onclick)());
            modalFooter.appendChild(buttonEl);
        });
        this.modalOverlay.classList.add('active');
    }

    closeModal() {
        if (this.modalOverlay) {
            this.modalOverlay.classList.remove('active');
            this.modalOverlay.innerHTML = '';
        }
    }
}