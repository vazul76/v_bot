const DEFAULT_PROVINCE = "di-yogyakarta";
const PROVINCE_URL = "https://nasgunawann.github.io/bensin-api/v1/provinsi";

class BbmCommand {
  constructor() {
    this.commands = [
      {
        name: "bbm",
        method: "execute",
        description: "Cek Harga BBM per Provinsi",
      },
    ];
  }

  getProvinceSlug(messageBody = "") {
    const province =
      messageBody.replace(/^\/bbm\b/i, "").trim() || DEFAULT_PROVINCE;
    const slug = province
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || DEFAULT_PROVINCE;
  }

  formatResponse(data) {
    const updatedAt = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(data.pertamina_updated_at));
    const products = data.products.map(
      ({ product, price_rupiah: price }) =>
        `- *${product}*: ${
          typeof price === "number"
            ? `Rp${new Intl.NumberFormat("id-ID").format(price)}`
            : "Tidak tersedia"
        }`,
    );

    return `*Harga BBM Pertamina*\n*${data.province}*\nDiperbarui: ${updatedAt}\n\n${products.join("\n")}\n\n_Sumber: bensin-api_`;
  }

  async execute(msg, sock, messageBody) {
    const logger = require("../utils/logger");
    const helpers = require("../utils/helpers");

    try {
      await helpers.reactCommandReceived(sock, msg);
      await helpers.reactProcessing(sock, msg);

      const slug = this.getProvinceSlug(messageBody);
      const response = await fetch(
        `${PROVINCE_URL}/${encodeURIComponent(slug)}.json`,
        {
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const error = new Error(`Fuel API returned ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      if (!data?.province || !Array.isArray(data.products)) {
        throw new Error("Fuel API returned an invalid response");
      }

      await helpers.replyWithTyping(sock, msg, this.formatResponse(data), 1200);
      await helpers.reactSuccess(sock, msg);
      logger.info(`Harga BBM berhasil diambil untuk ${data.province}`);
    } catch (error) {
      logger.error("Error in /bbm:", error);
      await helpers.reactError(sock, msg);
      const message =
        error.status === 404
          ? "Provinsi tidak ditemukan. Contoh: /bbm jawa barat"
          : "Gagal mengambil harga BBM. Coba lagi nanti.";
      await helpers.replyWithTyping(sock, msg, message);
    }
  }
}

module.exports = new BbmCommand();
