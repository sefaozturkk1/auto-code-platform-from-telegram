const Imap = require('imap');

/**
 * Gmail'e bağlan ve doğrulama kodu içeren en son e-postayı al
 * @param {string} email - Gmail adresi
 * @param {string} appPassword - Gmail App Password
 * @param {string} senderFilter - Gönderen filtresi (opsiyonel)
 * @returns {Promise<string|null>} - Bulunan kod veya null
 */
/**
 * Gmail'e bağlan ve doğrulama kodu içeren en son e-postayı al
 * @param {string} email - Gmail adresi
 * @param {string} appPassword - Gmail App Password
 * @param {Date} minTime - Bu tarihten eski e-postaları yok say
 * @returns {Promise<string|null>} - Bulunan kod veya null
 */
async function getVerificationCodeFromGmail(email, appPassword, minTime = null) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: email,
            password: appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        });

        imap.once('ready', () => {
            imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    imap.end();
                    reject(err);
                    return;
                }

                // Son 20 dakika içindeki e-postaları ara (garanti olsun diye biraz geniş tutuyoruz)
                const searchTime = new Date();
                searchTime.setMinutes(searchTime.getMinutes() - 20);

                const searchCriteria = [
                    ['SINCE', searchTime],
                    ['UNSEEN']
                ];

                imap.search(searchCriteria, (err, results) => {
                    if (err || !results || results.length === 0) {
                        // console.log('[GMAIL] No new emails found');
                        imap.end();
                        resolve(null);
                        return;
                    }

                    // Sonuçları UID'ye göre (zaman sırasına göre) sırala
                    results.sort((a, b) => a - b);

                    // En son sonuçtan başla
                    const fetchNext = (index) => {
                        if (index < 0) {
                            console.log('[GMAIL] No valid email found after timestamp check');
                            imap.end();
                            resolve(null);
                            return;
                        }

                        const uid = results[index];
                        const fetch = imap.fetch([uid], { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)', 'TEXT'], struct: true });

                        fetch.on('message', (msg) => {
                            let emailDate = null;
                            let subject = '';

                            msg.on('body', (stream, info) => {
                                let buffer = '';
                                stream.on('data', (chunk) => {
                                    buffer += chunk.toString('utf8');
                                });

                                stream.once('end', () => {
                                    if (info.which === 'TEXT') {
                                        // Body processing

                                        // Tarih kontrolü (Header'dan alınmalı ama burada basitlik için geçiyoruz, aşağıda header kontrolü var)
                                        // Ancak stream sırası asenkron olabilir, bu yüzden date check'i en sona saklayalım veya promise zinciri kuralım.
                                        // Basitleştirmek için: Header ve Body ayrı eventlerde gelir.

                                        msg.textBody = buffer;
                                    } else {
                                        // Header processing
                                        const headers = Imap.parseHeader(buffer);
                                        emailDate = headers.date ? headers.date[0] : null;
                                        subject = headers.subject ? headers.subject[0] : 'No Subject';
                                    }
                                });
                            });

                            msg.once('end', () => {
                                // Mesaj tamamlandı, kontrolleri yap
                                if (minTime && emailDate && new Date(emailDate) < minTime) {
                                    console.log(`[GMAIL] Ignoring old email: "${subject}" (Date: ${emailDate})`);
                                    fetchNext(index - 1);
                                    return;
                                }

                                const text = msg.textBody || '';
                                console.log(`[GMAIL] Processing email: "${subject}"`);

                                // Temizlik
                                const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

                                // 1. Strateji: Kelime bazlı arama (Kod: 123456)
                                // "Kod", "Code", "Doğrulama", "Şifre" kelimelerinden sonra gelen 5-6 haneli sayı
                                let pattern = /(?:Kod|Code|Doğrulama|Dogrulama|Şifre|Sifre|Verification|Verifikasyon).*?(\d{5,6})/i;
                                let match = cleanText.match(pattern);

                                // Kara liste (Blacklist)
                                const blacklist = ['000000', '111111', '123456', '987654', '444444', '333333'];

                                let foundCode = null;

                                if (match && !blacklist.includes(match[1])) {
                                    console.log('[GMAIL] Strong match found via keywords');
                                    foundCode = match[1];
                                } else {
                                    // 2. Strateji: Genel arama (Sadece 5-6 haneli sayı, ama 000000 hariç)
                                    // HTML entity olmayan, telefon numarası olmayan (basitçe)
                                    const allNumbers = cleanText.match(/\b(\d{5,6})\b/g);
                                    if (allNumbers) {
                                        // İlk geçerli sayıyı al
                                        const validNum = allNumbers.find(n => !blacklist.includes(n));
                                        if (validNum) {
                                            console.log('[GMAIL] Weak match found (isolated number)');
                                            foundCode = validNum;
                                        }
                                    }
                                }

                                if (foundCode) {
                                    console.log(`[GMAIL] Found code: ${foundCode}`);

                                    // Kodu bulduk, e-postayı okundu olarak işaretle
                                    imap.addFlags(uid, '\\Seen', (err) => {
                                        if (err) console.error('[GMAIL] Failed to mark as read:', err);
                                    });

                                    imap.end();
                                    resolve(foundCode);
                                } else {
                                    console.log('[GMAIL] No valid code found in email content');
                                    // Kod yoksa bir öncekine bak
                                    fetchNext(index - 1);
                                }
                            });
                        });

                        fetch.once('error', (err) => {
                            console.error('[GMAIL] Fetch error:', err);
                            fetchNext(index - 1);
                        });
                    };

                    // En son sonuçtan başla
                    fetchNext(results.length - 1);
                });
            });
        });

        imap.once('error', (err) => {
            console.error('[GMAIL] IMAP error:', err);
            reject(err);
        });

        imap.once('end', () => {
            // console.log('[GMAIL] Connection ended');
        });

        imap.connect();
    });
}

/**
 * Gmail'i belirli aralıklarla kontrol et ve kod bulunduğunda callback çağır
 * @param {string} email 
 * @param {string} appPassword 
 * @param {number} maxAttempts - Maksimum deneme sayısı
 * @param {number} intervalMs - Kontrol aralığı (ms)
 * @returns {Promise<string|null>}
 */
async function waitForVerificationCode(email, appPassword, maxAttempts = 30, intervalMs = 2000) {
    // Şimdiki zamanı al - bundan eski mailleri kabul etmeyeceğiz
    // Güvenlik payı olarak 10-15 saniye öncesini de kabul edelim (saat farkları vs için)
    const startTime = new Date();
    startTime.setSeconds(startTime.getSeconds() - 15);

    console.log(`[GMAIL] Waiting for verification code... (Min Time: ${startTime.toLocaleTimeString()})`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // console.log(`[GMAIL] Attempt ${attempt}/${maxAttempts}`);
            const code = await getVerificationCodeFromGmail(email, appPassword, startTime);
            if (code) {
                return code;
            }
        } catch (err) {
            console.error(`[GMAIL] Attempt ${attempt} failed:`, err.message);
        }

        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    console.log('[GMAIL] Max attempts reached, no code found');
    return null;
}

module.exports = {
    getVerificationCodeFromGmail,
    waitForVerificationCode
};
