// Экспорт деталей pleeply Pocket для сайта — каждая деталь отдельно, в координатах сборки (не в позе для печати).
// Запуск: openscad -D 'part="none"' -D 'piece="front"' -o web/front.stl web_export.scad
// Модель не меняется: основной файл подключается целиком, а part="none" выключает его собственный вывод.
include <pleeply_pocket.scad>

piece = "front";

if (piece == "front") front_part();
else if (piece == "back") back_part();
else if (piece == "door") door_part();
else if (piece == "ptt") on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_part();
else if (piece == "ptt_plate") on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_plate_part();
else if (piece == "rocker") on_top() rocker_part();
else if (piece == "lever") pwr_lever_mock();
else if (piece == "pi_pcb") m_pi_pcb();
else if (piece == "pi_usb") m_pi_usb();
else if (piece == "pi_cooler") m_pi_cooler();
else if (piece == "pi_gpio") m_pi_gpio();
else if (piece == "battery") m_battery();
else if (piece == "boost") m_boost();
else if (piece == "amp") m_amp();
else if (piece == "tp4056") m_tp4056();
else if (piece == "switch") translate([pwr_x1 - pwr_body[0], pwr_c[0] - pwr_body[1]/2, pwr_c[1] - pwr_body[2]/2]) cube(pwr_body);
else if (piece == "speaker") m_speaker();
else if (piece == "mic") m_mic();
else if (piece == "ptt_switch") m_ptt_switch();
else if (piece == "rocker_switches") m_rocker_switches();
else if (piece == "magnets") m_magnets();
