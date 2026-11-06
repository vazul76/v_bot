/**
 * Penyimpanan sementara untuk alur saran command:
 * - menunggu konfirmasi "ya"
 * - memilih salah satu opsi (1/2/...)
 * - menunggu argumen (teks/link/tempat)
 * - menunggu media (gambar/video)
 *
 * Disimpan in-memory, per kombinasi chat + pengirim, dengan TTL.
 * Hanya pengirim yang sama di chat yang sama yang boleh melanjutkan.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 menit

class PendingActions {
    constructor(ttlMs = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
        this.store = new Map();
    }

    key(chatId, senderId) {
        return `${chatId || '-'}::${senderId || '-'}`;
    }

    set(chatId, senderId, action) {
        const now = Date.now();
        const record = {
            ...action,
            chatId,
            senderId,
            createdAt: now,
            expiresAt: now + this.ttlMs
        };

        this.store.set(this.key(chatId, senderId), record);
        this.sweep();
        return record;
    }

    get(chatId, senderId) {
        const key = this.key(chatId, senderId);
        const action = this.store.get(key);

        if (!action) return null;

        if (action.expiresAt <= Date.now()) {
            this.store.delete(key);
            return null;
        }

        return action;
    }

    clear(chatId, senderId) {
        this.store.delete(this.key(chatId, senderId));
    }

    sweep() {
        const now = Date.now();
        for (const [key, action] of this.store.entries()) {
            if (action.expiresAt <= now) this.store.delete(key);
        }
    }

    size() {
        this.sweep();
        return this.store.size;
    }
}

module.exports = new PendingActions();
module.exports.PendingActions = PendingActions;
