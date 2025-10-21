class ModalManager {
    constructor(app) {
        this.app = app;
        this.modalOverlay = document.getElementById('modalOverlay');
        if (this.modalOverlay) {
            // Add a single listener to the overlay for closing
            this.modalOverlay.addEventListener('click', (e) => {
                // If the click is on the overlay itself or a close button inside the modal
                if (e.target === this.modalOverlay || e.target.closest('.modal-close')) {
                    this.closeModal();
                }
            });
        }
    }

    showModal(title, body, buttons) {
        if (!this.modalOverlay) {
            console.error("Modal overlay not found in the DOM!");
            return;
        }

        // Always create the modal structure from scratch to ensure consistency
        this.modalOverlay.innerHTML = `
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h3 id="modalTitle">${title}</h3>
                    <button class="modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" id="modalBody">${body}</div>
                <div class="modal-footer" id="modalFooter"></div>
            </div>
        `;
        
        const modalFooter = this.modalOverlay.querySelector('#modalFooter');
        this.addButtonsToFooter(modalFooter, buttons);
        
        this.modalOverlay.classList.add('active');
    }

    addButtonsToFooter(footerElement, buttons) {
        if (!footerElement) return;
        footerElement.innerHTML = ''; // Clear any existing buttons
        if (buttons && buttons.length > 0) {
            buttons.forEach(btnInfo => {
                const buttonEl = document.createElement('button');
                buttonEl.className = `btn ${btnInfo.class}`;
                buttonEl.innerHTML = btnInfo.text;
                // Using a direct function call is safer than new Function()
                buttonEl.addEventListener('click', () => {
                    try {
                        // This is a safer way to execute the string function
                        new Function(btnInfo.onclick)();
                    } catch (e) {
                        console.error("Error executing modal button onclick:", e);
                    }
                });
                footerElement.appendChild(buttonEl);
            });
        }
    }

    closeModal() {
        if (this.modalOverlay) {
            this.modalOverlay.classList.remove('active');
            this.modalOverlay.innerHTML = ''; // Clear content on close
        }
    }

    showConfirmDialog(title, message, onConfirm) {
        this.showModal(title, `<p>${message}</p>`, [
            { 
                text: 'Cancel', 
                class: 'btn-secondary', 
                onclick: 'warehouseApp.modalManager.closeModal()' 
            },
            { 
                text: 'Confirm', 
                class: 'btn-primary', 
                onclick: `${onConfirm}; warehouseApp.modalManager.closeModal()` 
            }
        ]);
    }
}