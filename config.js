/* Cấu hình website khảo sát P1.6.1 — sửa tệp này trước khi đưa lên mạng (xem README_trien_khai.md). */
window.SURVEY_CONFIG = {
  // URL Web App của Google Apps Script (dạng https://script.google.com/macros/s/…/exec).
  // Để trống = CHẾ ĐỘ THỬ: không gửi đi đâu, chỉ lưu trên máy (xem và tải ở trang ?admin=1).
  ENDPOINT: "https://script.google.com/macros/s/AKfycbwq-DxCqkQ2lkb8X3jAhDkkbI-yzIdgd9JfJZ-gQEDWdfKYYTgzCBYQcLTHj9mc3daWxA/exec",
  // Mã bí mật, phải trùng TOKEN trong apps_script/Code.gs (chặn bớt dữ liệu rác; không phải bảo mật mạnh).
  TOKEN: "7bF4GI71gGXhSKCQ8ar7NAn9",
  // Hiện đồng hồ đếm thời gian làm bài ở đầu trang (thời gian luôn được ghi dù hiện hay ẩn).
  SHOW_TIMER: true,
  // Thông tin trên trang đồng ý tham gia (thay các ô trong ngoặc vuông).
  RESEARCH_TEAM: "[RESEARCH_TEAM]",
  CONTACT_EMAIL: "[CONTACT_EMAIL]",
  // Có thể ghi riêng cho từng ngôn ngữ: en, fr, ru, es, zh, ko, vi; thiếu ngôn ngữ nào thì dùng bản en.
  DATA_ACCESS: { en: "[DATA_ACCESS_AND_RETENTION]", vi: "[DATA_ACCESS_AND_RETENTION]" }
};
