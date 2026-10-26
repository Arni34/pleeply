// pleeply Pocket — корпус прототипа для 3D-печати, v0.4: «мыло» с плоским дном
// Внутри: Raspberry Pi 5 + Active Cooler, LiPo 103565 (3000 мА·ч), зарядка TP4056 с USB-C, повышение Pololu U3V40F5,
// I2S-микрофон INMP441, I2S-усилитель MAX98357A, тонкий динамик 40 мм, кнопка PTT 12×12×4.3, кнопки громкости 6×6,
// ползунковый выключатель.
//
// Форма — как кусок мыла: дно (−Z) плоское, верх (+Z) с мягко скруглёнными рёбрами, корпус лежит на дне.
// На плоском дне всё рабочее: отверстия складываются в «pleeply.» (за ними динамик, под точкой — микрофон),
// кнопка PTT Ø15 и гравировка «pocket» ровно по центру. Сверху только мини-гравировка «pleeply.».
// Левый бок — отсек разъёмов Pi под крышкой на магнитах, правый — гнездо зарядки USB-C и выключатель,
// верхний бок — качелька громкости и вентиляция.
// Толщина 26 мм — минимум для Pi 5: блок USB/Ethernet 16.5 мм по официальному чертежу + плата + стойки + стенки.
//
// Оси: X — ширина, Y — высота в плане, Z — толщина (+Z — верх с мини-гравировкой, −Z — плоское дно).
// Одна деталь:  openscad -D 'part="front"' --backend=Manifold -o stl/front.stl pleeply_pocket.scad
// Детали: front (верх), back (поддон с дном), door, ptt, rocker. Виды: assembly, bottom_view, exploded, section, print_all.

part = "assembly"; // [assembly, bottom_view, exploded, section, step, tray_map, top_map, front, back, door, ptt, ptt_plate, rocker, print_all, clash]

/* [Корпус] */
L = 128;           // ширина
H = 116;           // высота
D = 26;            // толщина
wall = 2.2;        // стенка
Rs = 11;           // скругление рёбер к верху — «мыло»
Rc = 8;            // скругление углов в плане у дна
chamfer = 0.8;     // фаска по краю плоского дна
split_z = 2;       // разъём: ниже — поддон с плоским дном и прямыми боками, выше — скруглённый верх
fit = 0.25;        // зазор для подвижных деталей
boss_d = 7;        // стойки под винты M2

/* [Raspberry Pi 5: внизу, компонентами к дну, USB и Ethernet к левому боку] */
pi_x = [-57.4, 27.6];      // от торца с USB/Ethernet до торца с картой SD
pi_y = [-46.8, 9.2];
pcb_z = D/2 - wall - 2.5 - 1.6;   // сторона с компонентами смотрит на дно; плата на стойках 2.5 мм от верха
pi_pcb = 1.6;
pi_usb_h = 16.5;           // блок USB/Ethernet над платой (чертёж 1:1, с язычком экрана); за край платы — 3 мм
cooler = [60, 40, 13.7];   // официальный Active Cooler: 63.5 × 42.5 × 13.7 мм по документу
standoff_d = 6; standoff_hole = 2.2;   // стойки под саморез M2.5 × 4

/* [Над Pi, у верхнего края: аккумулятор; справа от Pi: Pololu и усилитель] */
bat = [67, 36, 10.5]; bat_c = [0, 29]; bat_z = 0;   // 103565 с платой защиты, отсек с запасом
boost = [15.2, 15.2, 5.6]; boost_c = [42.6, -10.4]; // повышение Pololu U3V40F5 (вывод EN), на скотч к верху
amp = [19.4, 17.8, 3];     amp_c = [41.7, -31.1];   // усилитель MAX98357A, на скотч к верху

/* [Правый бок: гнездо зарядки TP4056 и выключатель] */
usbc_c = [0, -5];              // [y, z] центр гнезда — это USB-C самой платы TP4056
usbc_jack = [7.3, 9, 3.3];     // гнездо: глубина, ширина, высота
usbc_pcb = [26, 17.5, 1.6];    // плата TP4056 под гнездом; гнездо выступает за её край на 0.5 мм
// выключатель над гнездом: ползунок SS-12D00G4 ходит вдоль Y, вверх — включено.
// Он слаботочный, поэтому переключает вход EN платы Pololu, а не 5 В.
pwr_c = [20, -4];              // [y, z] центр
pwr_body = [3.5, 8.6, 3.6];    // корпус: высота (к боку), длина (вдоль хода), ширина
pwr_lever = [4, 2, 1.5];       // рычажок: длина, вдоль хода, поперёк
pwr_travel = 2;                // ход рычажка

/* [Дно: координаты u, v — как видно, если смотреть на дно] */
spk_d = 40; spk_h = 10; spk_c = [0, 34];      // динамик за строкой у верхнего края: ультратонкий (~5 мм), обычные 40 мм глубиной 20 мм не влезут
ptt_c = [-44, -37];                           // кнопка PTT слева внизу
ptt_cap_d = 15; ptt_flange_d = 17.5; ptt_stem = 1.5; ptt_proud = -0.6;   // колпачок утоплен: лёжа на столе кнопка не нажимается
ptt_tube_d = 21.7;                            // люлька: внутри 18.5 мм, фланец 17.5 ходит свободно
sw12 = [12, 12, 4.3];      // низкая тактовая кнопка 12×12×4.3
// Отверстия складываются в бегущую строку «pleeply.» у верхнего края дна: повторы обрезаны по краю дна,
// за серединой строки стоит динамик и звучит через буквы, микрофон — за одним отверстием справа (если смотреть на дно).
mic_text_c = [0, 46];        // центр строки — у верхнего края дна
mic_repeat = 5;              // сколько раз повторить «pleeply.»; лишнее обрезается по краю дна
mic_pitch = 1.5;             // шаг сетки: при 1.0 отверстия сливаются, меньше 1.5 перемычки тоньше 0.5 мм
mic_hole = 1.0;              // отверстие: меньше 1 мм принтер уже не пробивает насквозь
mic_dot = 1.5;               // точка в конце слова
mic_port = [116, 6];         // [колонка, строка] отверстия напротив порта микрофона: «l» четвёртого слова
mic_clip = 60;               // строка обрезается по |u| ≤ mic_clip: не режет боковые стенки
pocket_text = "pocket";      // гравировка ровно по центру дна
pocket_size = 9;
pocket_depth = 0.6;
/* [Hidden] */   // сетка букв — правится в коде, в Customizer не нужна
// Сетка 9 строк: 0–1 — верх «l», 2–6 — строчные, 7–8 — хвосты «p» и «y». X — отверстие, D — крупная точка.
g_p = ["....", "....", "XXX.", "X..X", "X..X", "X..X", "XXX.", "X...", "X..."];
g_e = ["....", "....", ".XX.", "X..X", "XXXX", "X...", ".XXX", "....", "...."];
g_l = ["X", "X", "X", "X", "X", "X", "X", ".", "."];
g_y = ["....", "....", "X..X", "X..X", "X..X", "X..X", ".XXX", "...X", ".XX."];
g_dot = [".", ".", ".", ".", ".", ".", "D", ".", "."];
g_sp = [".....", ".....", ".....", ".....", ".....", ".....", ".....", ".....", "....."];   // пробел между повторами: 5 колонок + 2 обычных
word = [g_p, g_l, g_e, g_e, g_p, g_l, g_y, g_dot];       // p l e e p l y .
mic_word = [for (k = [0 : mic_repeat - 1], g = (k < mic_repeat - 1 ? concat(word, [g_sp]) : word)) g];

/* [Качелька громкости — верхний бок, справа] */
rock_x = 41;                       // по ширине корпуса (до x ≈ 53 бок строго прямой); «+» справа, если смотреть на дно
rock_y = 0; rock_z = -3; rock_slot = [20, 6];   // rock_y — в координатах качельки, вдоль неё
sw6 = [6, 6, 4.3];                 // тактовая кнопка 6×6×4.3

/* [Отсек разъёмов Pi — левый бок] */
door_x0 = -59;                     // крышка — всё, что левее
door_y = [-52, 14.2];
rim_t = 3;                         // полка, на которую ложится крышка
magnet = [4.2, 1.6];               // гнездо под магнит 4 × 1.5 мм
magnet_pts = [[-49.45, -7], [-49.45, -2], [11.8, -7], [11.8, -2]];   // [y, z] на прямой стенке

/* [Вентиляция — прорези в нижнем боку у кулера Pi] */
vent_x = [-30, -8]; vent_n = 6;

/* [Мини-гравировка сверху] */
brand_size = 3.2;
brand_depth = 0.5;
brand_at = [50, -44];              // правый нижний угол верха, текст выровнен вправо

/* [Качество] */
$fn = 48;
fn_body = 96;                      // гладкость скруглений корпуса

// ---------- производные ----------
z_front_in = D/2 - wall;           // внутренняя сторона верха (в плоской части); дно — то же в зеркале
x_side_in  = L/2 - wall;
top_in     = H/2 - wall;
pi_holes = [for (dx = [3.5, 61.5], y = [pi_y[0] + 3.5, pi_y[1] - 3.5]) [pi_x[1] - dx, y]];
bosses = [[-56, 34], [58.5, 34], [-54, -51], [54, -51]];
usbc_x1 = L/2 - 2.3;               // перед гнезда: снаружи выемка 1.5 мм, чтобы штекер вошёл до конца
pwr_x1  = x_side_in - 0.3;         // верх корпуса выключателя почти вплотную к стенке
pwr_slot = [pwr_lever[1] + pwr_travel + 0.6, pwr_lever[2] + 0.6];

// надпись: с какой колонки начинается каждая буква (между буквами одна пустая)
function gw(g) = len(g[0]);
function col0(i) = i == 0 ? 0 : col0(i - 1) + gw(mic_word[i - 1]) + 1;
mic_cols = col0(len(mic_word) - 1) + gw(mic_word[len(mic_word) - 1]);
function mic_xy(c, r) = [mic_text_c[0] + (c - (mic_cols - 1)/2)*mic_pitch, mic_text_c[1] + (4 - r)*mic_pitch];
function near_boss(p) = min([for (b = bosses) norm(p - [-b[0], b[1]])]) < boss_d/2 + 1.2;
mic_pts = [for (i = [0 : len(mic_word) - 1]) let(g = mic_word[i])
           for (r = [0 : 8], c = [0 : gw(g) - 1]) let(p = mic_xy(col0(i) + c, r))
               if (g[r][c] != "." && abs(p[0]) <= mic_clip && !near_boss(p))
                   concat(p, [g[r][c] == "D" ? mic_dot : mic_hole])];
mic_c = mic_xy(mic_port[0], mic_port[1]);   // центр платы INMP441: её порт ровно под точкой

// PTT (в координатах дна): колпачок → шток → кнопка → площадка
ptt_flange_z = z_front_in - 1.2;
ptt_stem_z   = ptt_flange_z - ptt_stem;
sw12_top     = ptt_stem_z - 0.4;
sw12_bot     = sw12_top - sw12[2];
ptt_plate_top = sw12_bot + 0.6;    // гнездо 0.6 мм

// качелька в своих координатах: X — наружу через верхний бок, Y — вдоль качельки.
// Фланец изнутри стенки → штырьки → кнопки → кронштейн.
rk_flange_x = top_in - 1.2;
rk_nub_x    = rk_flange_x - 1.5;
sw6_top     = rk_nub_x - 0.3;
sw6_bot     = sw6_top - sw6[2];
rk_face_x   = sw6_bot + 0.6;
rk_plate_t  = 1.5;

// ---------- форма ----------
// «Мыло»: плоское дно с фаской и углами Rc, прямые бока до z = D/2 − Rs, дальше рёбра скругляются радиусом Rs.
// off — смещение внутрь: даёт внутреннюю полость и тонкую «кожу» для гравировок.
module soap(off = 0) {
    hull() {
        translate([0, 0, -D/2 + off]) linear_extrude(0.01)
            offset(r = max(Rc - off - chamfer, 0.5)) square([L - 2*Rc, H - 2*Rc], center = true);
        translate([0, 0, -D/2 + off + chamfer]) linear_extrude(0.01)
            offset(r = Rc - off) square([L - 2*Rc, H - 2*Rc], center = true);
        for (sx = [-1, 1], sy = [-1, 1]) translate([sx*(L/2 - Rs), sy*(H/2 - Rs), D/2 - Rs]) sphere(Rs - off, $fn = fn_body);
    }
}
module outer_solid(off = 0) { soap(off); }
module inner_solid(off = 0) { soap(wall + off); }
module shell_raw() { difference() { outer_solid(); inner_solid(); } }
module above_z(z0) { translate([-200, -200, z0]) cube([400, 400, 400]); }
module below_z(z0) { translate([-200, -200, z0 - 400]) cube([400, 400, 400]); }

// детали дна рисуются как на верхе и переворачиваются: u = −x, v = y, w = −z
module on_back() { rotate([0, 180, 0]) children(); }
// детали качельки рисуются как на боку (наружу +X) и встают на верхний бок: X → Y
module on_top() { translate([rock_x, 0, 0]) rotate([0, 0, 90]) children(); }

module rrect_x(w, h, r, len) {   // скруглённый прямоугольник в плоскости YZ, выдавлен по X
    hull() for (sy = [-1, 1], sz = [-1, 1]) translate([0, sy*(w/2 - r), sz*(h/2 - r)]) rotate([0, 90, 0]) cylinder(r = r, h = len, $fn = 24);
}

// ---------- отсек разъёмов ----------
module door_box(off = 0) {
    translate([-L, door_y[0] - off, -D]) cube([L + door_x0 + off, door_y[1] - door_y[0] + 2*off, 2*D]);
}
module rim_box() { translate([-L, door_y[0] - 2.5, -D]) cube([L + door_x0 + 2.5, door_y[1] - door_y[0] + 5, 2*D]); }
// где полки быть не должно: штекеры в USB и Ethernet Pi проходят свободно
module pi_port_clear() { translate([-L, pi_y[0] - 0.5, pcb_z - pi_usb_h - 2]) cube([L - 50, pi_y[1] - pi_y[0] + 1, pi_usb_h + 2 + pi_pcb + 0.5]); }
module door_rim() {
    difference() {
        intersection() { difference() { inner_solid(0); inner_solid(rim_t); } rim_box(); }
        pi_port_clear();
    }
}
// магниты на прямой части левой стенки; into_door: гнездо уходит наружу в крышку, иначе внутрь в полку
module magnet_pockets(into_door) {
    for (m = magnet_pts) translate([-x_side_in, m[0], m[1]]) rotate([0, into_door ? -90 : 90, 0])
        translate([0, 0, -3]) cylinder(d = magnet[0], h = magnet[1] + 3, $fn = 32);
}
// выемка под палец на шве крышки со стороны дна
module door_notch() { translate([door_x0, (door_y[0] + door_y[1])/2 - 6, -D/2]) rotate([-90, 0, 0]) cylinder(r = 2.4, h = 12, $fn = 32); }

// ---------- верхняя половина: стойки Pi, направляющие аккумулятора ----------
module front_features() {
    for (p = pi_holes) translate([p[0], p[1], pcb_z + pi_pcb]) cylinder(d = standoff_d, h = 30);
    for (s = [-1, 1]) translate([bat_c[0] - bat[0]/2 + 8, bat_c[1] + s*(bat[1]/2 + 0.9) - 0.6, split_z + 0.1])
        cube([bat[0] - 16, 1.2, 30]);
}
module standoff_holes() {
    for (p = pi_holes) translate([p[0], p[1], pcb_z + pi_pcb]) cylinder(d = standoff_hole, h = 3, $fn = 16);
}

// мини-гравировка «pleeply.» в правом нижнем углу верха
module brand_text() {
    translate([brand_at[0], brand_at[1], 5]) linear_extrude(height = 20)
        text("pleeply", size = brand_size, font = "Liberation Sans:style=Bold", halign = "right", valign = "baseline");
    translate([brand_at[0] + brand_size*0.35, brand_at[1] + brand_size*0.19, 5]) cylinder(r = brand_size*0.185, h = 20, $fn = 24);
}
module brand_engrave() { intersection() { brand_text(); difference() { outer_solid(); outer_solid(brand_depth); } } }

// гравировка «pocket» ровно по центру плоского дна
module pocket_text_local() {
    translate([0, 0, 5]) linear_extrude(height = 20)
        text(pocket_text, size = pocket_size, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
}
module pocket_engrave() { intersection() { on_back() pocket_text_local(); difference() { outer_solid(); outer_solid(pocket_depth); } } }

// ---------- поддон (в координатах дна) ----------
module back_features_local() {
    // кольцо-посадка динамика
    translate([spk_c[0], spk_c[1], z_front_in - 3]) difference() {
        cylinder(d = spk_d + 0.6 + 2.4, h = 3.5);
        translate([0, 0, -1]) cylinder(d = spk_d + 0.6, h = 6);
    }
    // рамка под плату микрофона 14 × 14
    translate([mic_c[0], mic_c[1], z_front_in - 2]) difference() {
        translate([-8.6, -8.6, 0]) cube([17.2, 17.2, 2.5]);
        translate([-7.3, -7.3, -1]) cube([14.6, 14.6, 5]);
    }
    // люлька PTT: труба от стенки, открыта внутрь — колпачок и кнопка вставляются изнутри,
    // потом сверху надевается площадка (отдельная деталь ptt_plate_part)
    translate([ptt_c[0], ptt_c[1], 0]) difference() {
        translate([0, 0, ptt_plate_top]) cylinder(d = ptt_tube_d, h = 40, $fn = 64);
        translate([0, 0, ptt_plate_top - 1]) cylinder(d = ptt_tube_d - 3.2, h = 42, $fn = 64);
    }
}
// насквозь, в том числе через кольцо динамика и рамку микрофона
module mic_holes_local() {
    for (p = mic_pts) translate([p[0], p[1], z_front_in - 3]) cylinder(d = p[2], h = 12, $fn = 20);
}
module ptt_hole_local() { translate([ptt_c[0], ptt_c[1], z_front_in - 1]) cylinder(d = ptt_cap_d + 0.6, h = 10, $fn = 64); }

// ---------- кронштейн качельки (в её координатах) ----------
module rocker_features_local() {
    translate([rk_face_x - rk_plate_t, rock_y - 10, rock_z - 4.5]) difference() {
        cube([rk_plate_t, 20, 8.9]);
        for (dy = [-6, 6]) {
            translate([rk_plate_t - 0.6, 10 + dy - 3.1, 4.5 - 3.1]) cube([1, 6.2, 10]);          // гнездо, открыто сверху
            for (ly = [-3.25, 3.25]) translate([-1, 10 + dy + ly - 0.7, 4.5 - 3.25]) cube([5, 1.4, 10]);   // прорези под ножки, открыты сверху
        }
    }
    for (dy = [-15, 15]) translate([rk_face_x - rk_plate_t, rock_y + dy - 1.5, rock_z - 4.5])
        cube([H/2 - rk_face_x + rk_plate_t, 3, 8.9]);
}
module rocker_slot_local() { translate([rk_flange_x + 1.2, rock_y, rock_z]) rrect_x(rock_slot[0] + 2*fit, rock_slot[1] + 2*fit, 1.5 + fit, 10); }

// ---------- правый бок: плата TP4056 и выключатель ----------
module usbc_features() {
    // направляющие платы TP4056: плата вставляется между ними и приклеивается
    for (s = [-1, 1]) translate([usbc_x1 - 10, usbc_c[0] + s*(usbc_pcb[1]/2 + 0.9) - 0.6, usbc_c[1] - usbc_jack[2]/2 - usbc_pcb[2] - 0.4])
        cube([20, 1.2, usbc_pcb[2] + 0.9]);
}
module usbc_recess() { translate([L/2 - 1.5, usbc_c[0], usbc_c[1]]) rrect_x(12.5, 7, 3, 5); }   // выемка под корпус штекера
module usbc_hole() { translate([usbc_x1 - usbc_jack[0], usbc_c[0], usbc_c[1]]) rrect_x(usbc_jack[1] + 0.4, usbc_jack[2] + 0.4, 1.75, 20); }
// рамка под корпус выключателя: он вставляется изнутри и приклеивается, ножки смотрят внутрь корпуса
module pwr_features() {
    translate([pwr_x1 - pwr_body[0], pwr_c[0] - pwr_body[1]/2 - 1.35, pwr_c[1] - pwr_body[2]/2 - 1.35]) difference() {
        cube([pwr_body[0] + 5, pwr_body[1] + 2.7, pwr_body[2] + 2.7]);
        translate([-1, 1.2, 1.2]) cube([pwr_body[0] + 1.01, pwr_body[1] + 0.3, pwr_body[2] + 0.3]);
    }
}
module pwr_slot_hole() { translate([pwr_x1 - 0.01, pwr_c[0], pwr_c[1]]) rrect_x(pwr_slot[0], pwr_slot[1], 0.6, 10); }
// метка «вкл»: точка над прорезью
module pwr_mark() { translate([L/2 - 0.5, pwr_c[0] + pwr_slot[0]/2 + 1.8, pwr_c[1]]) rotate([0, 90, 0]) cylinder(d = 1.2, h = 3, $fn = 16); }
module vents() {
    for (i = [0 : vent_n - 1]) translate([vent_x[0] + i*(vent_x[1] - vent_x[0])/(vent_n - 1) - 0.8, -top_in - wall - 2, -9])
        cube([1.6, wall + 3, 9]);
}

// ---------- стяжка половин: M2 × 12 со стороны дна ----------
module boss_cols() { for (b = bosses) translate([b[0], b[1], -D/2]) cylinder(d = boss_d, h = D); }
module boss_holes() {
    for (b = bosses) translate([b[0], b[1], 0]) {
        translate([0, 0, -D/2 - 1]) cylinder(d = 2.4, h = D/2 + 1 + split_z + 0.01, $fn = 16);    // проход винта
        translate([0, 0, -D/2 - 1]) cylinder(d = 4.4, h = D/2 + 1 + split_z - 6, $fn = 24);       // под головку
        translate([0, 0, split_z - 0.01]) cylinder(d = 1.7, h = 6.5, $fn = 16);                    // под резьбу M2
    }
}
module lip() {
    difference() {
        intersection() {
            difference() { inner_solid(0.2); inner_solid(1.4); }
            translate([-200, -200, split_z - 2]) cube([400, 400, 2]);
        }
        for (b = bosses) translate([b[0], b[1], -D/2]) cylinder(d = boss_d + 0.8, h = D);
        rim_box();
        on_top() translate([top_in - 6, rock_y - 18, -50]) cube([12, 36, 100]);
    }
}

// ---------- корпус целиком ----------
module body() {
    difference() {
        union() {
            difference() {
                union() {
                    shell_raw();
                    intersection() {
                        union() {
                            front_features(); on_back() back_features_local(); on_top() rocker_features_local();
                            usbc_features(); pwr_features(); boss_cols();
                        }
                        outer_solid();
                    }
                }
                door_box(0);
            }
            door_rim();
        }
        on_back() { mic_holes_local(); ptt_hole_local(); }
        on_top() rocker_slot_local();
        usbc_hole();
        usbc_recess();
        pwr_slot_hole();
        pwr_mark();
        vents();
        boss_holes();
        standoff_holes();
        brand_engrave();
        pocket_engrave();
        magnet_pockets(false);
        door_notch();
    }
}
module front_part() { union() { intersection() { body(); above_z(split_z); } lip(); } }
module back_part()  { intersection() { body(); below_z(split_z); } }

module door_part() {
    difference() {
        intersection() { shell_raw(); door_box(-fit); }
        magnet_pockets(true);
        door_notch();
        pocket_engrave();
    }
}

// ---------- кнопка PTT с гравировкой микрофона (в координатах дна, в центре) ----------
module mic_glyph() {
    hull() { translate([0, 2.4]) circle(r = 1.5); translate([0, 0.6]) circle(r = 1.5); }
    difference() {
        translate([0, 0.8]) circle(r = 3.0);
        translate([0, 0.8]) circle(r = 2.3);
        translate([-5, 0.8]) square([10, 6]);
    }
    translate([-0.35, -3.6]) square([0.7, 1.6]);
    translate([-1.7, -4.3]) square([3.4, 0.7]);
}
module ptt_part() {
    top = D/2 + ptt_proud;
    difference() {
        union() {
            translate([0, 0, ptt_flange_z]) cylinder(d = ptt_flange_d, h = 1.2, $fn = 64);
            translate([0, 0, z_front_in]) cylinder(d = ptt_cap_d, h = top - z_front_in - 0.5, $fn = 64);
            translate([0, 0, top - 0.5]) cylinder(d1 = ptt_cap_d, d2 = ptt_cap_d - 1, h = 0.5, $fn = 64);   // фаска
            translate([0, 0, ptt_stem_z]) cylinder(d = 4.5, h = ptt_stem + 0.01);
        }
        translate([0, 0, top - 0.6]) linear_extrude(height = 2) scale(1.15) mic_glyph();
    }
}

// площадка кнопки PTT: диск с гнездом под кнопку 12×12 и прорезями под ножки,
// юбкой надевается на люльку снаружи и приклеивается
module ptt_plate_part() {
    difference() {
        union() {
            translate([0, 0, ptt_plate_top - 1.6]) cylinder(d = ptt_tube_d + 2.7, h = 1.6, $fn = 64);
            translate([0, 0, ptt_plate_top]) difference() {
                cylinder(d = ptt_tube_d + 2.7, h = 1.5, $fn = 64);
                translate([0, 0, -1]) cylinder(d = ptt_tube_d + 0.3, h = 3, $fn = 64);
            }
        }
        translate([-6.2, -6.2, ptt_plate_top - 0.6]) cube([12.4, 12.4, 1]);
        for (sx = [-1, 1]) translate([sx*6.25 - 1, -4, ptt_plate_top - 3]) cube([2, 8, 4]);
    }
}

// ---------- качелька громкости с «+» и «−» (в её координатах) ----------
module rocker_part() {
    face = H/2 + 0.8;
    difference() {
        union() {
            translate([rk_flange_x, rock_y - 12.5, rock_z - 4.25]) cube([1.2, 25, 8.5]);
            translate([rk_flange_x + 1.19, rock_y, rock_z]) rrect_x(rock_slot[0], rock_slot[1], 1.5, face - rk_flange_x - 1.19);
            for (dy = [-6, 6]) translate([rk_nub_x, rock_y + dy, rock_z]) rotate([0, 90, 0]) cylinder(d = 2.5, h = 1.51, $fn = 24);
        }
        // «+» и «−», глубина 0.5 мм
        translate([face - 0.5, rock_y + 5.5, rock_z]) rotate([0, 90, 0]) linear_extrude(1) union() {
            square([3.4, 0.8], center = true); square([0.8, 3.4], center = true);
        }
        translate([face - 0.5, rock_y - 5.5, rock_z]) rotate([0, 90, 0]) linear_extrude(1) square([0.8, 3.4], center = true);
    }
}

// ---------- макеты компонентов (для вида, проверки и инструкции; без цвета — цвет задают виды) ----------
module pwr_lever_mock() {   // рычажок выключателя в положении «вкл»
    translate([pwr_x1, pwr_c[0] + pwr_travel/2 - pwr_lever[1]/2, pwr_c[1] - pwr_lever[2]/2]) cube(pwr_lever);
}
module m_pi_pcb()    { translate([pi_x[0], pi_y[0], pcb_z]) cube([pi_x[1] - pi_x[0], pi_y[1] - pi_y[0], pi_pcb]); }
module m_pi_usb()    { translate([pi_x[0] - 3, pi_y[0] + 2, pcb_z - pi_usb_h]) cube([24, pi_y[1] - pi_y[0] - 4, pi_usb_h]); }   // USB и Ethernet
module m_pi_cooler() { translate([pi_x[1] - 2 - cooler[0], pi_y[0] + 2, pcb_z - cooler[2]]) cube(cooler); }                     // Active Cooler
module m_pi_gpio()   { translate([pi_x[1] - 58, pi_y[1] - 6, pcb_z - 8.6]) cube([51, 5, 8.6]); }                                 // GPIO
module m_pi()        { m_pi_pcb(); m_pi_usb(); m_pi_cooler(); m_pi_gpio(); }
module m_battery()   { translate([bat_c[0] - bat[0]/2, bat_c[1] - bat[1]/2, bat_z]) cube(bat); }
module m_boost()     { translate([boost_c[0] - boost[0]/2, boost_c[1] - boost[1]/2, z_front_in - 0.2 - boost[2]]) cube(boost); }
module m_amp()       { translate([amp_c[0] - amp[0]/2, amp_c[1] - amp[1]/2, z_front_in - 0.2 - amp[2]]) cube(amp); }
module m_tp4056_jack() { translate([usbc_x1 - usbc_jack[0], usbc_c[0], usbc_c[1]]) rrect_x(usbc_jack[1], usbc_jack[2], 1.6, usbc_jack[0]); }
module m_tp4056_pcb()  { translate([usbc_x1 - 0.5 - usbc_pcb[0], usbc_c[0] - usbc_pcb[1]/2, usbc_c[1] - usbc_jack[2]/2 - usbc_pcb[2]]) cube(usbc_pcb); }
module m_tp4056()    { m_tp4056_jack(); m_tp4056_pcb(); }
module m_switch()    { translate([pwr_x1 - pwr_body[0], pwr_c[0] - pwr_body[1]/2, pwr_c[1] - pwr_body[2]/2]) cube(pwr_body); pwr_lever_mock(); }
module m_speaker()   { on_back() translate([spk_c[0], spk_c[1], z_front_in - spk_h]) cylinder(d1 = 22, d2 = spk_d, h = spk_h); }
module m_mic()       { on_back() translate([mic_c[0] - 7, mic_c[1] - 7, z_front_in - 3]) cube([14, 14, 3]); }   // INMP441 14 × 14 × 3
module m_ptt_switch() {
    on_back() {
        translate([ptt_c[0] - 6, ptt_c[1] - 6, sw12_bot]) cube([12, 12, 3.3]);
        translate([ptt_c[0], ptt_c[1], sw12_bot + 3.3]) cylinder(d = 6, h = sw12[2] - 3.3);
    }
}
module m_rocker_switches() { on_top() for (dy = [-6, 6]) translate([sw6_bot, rock_y + dy - 3, rock_z - 3]) cube([sw6[2], 6, 6]); }
module m_magnets()   { for (m = magnet_pts) translate([-x_side_in, m[0], m[1]]) rotate([0, 90, 0]) cylinder(d = 4, h = 1.5, $fn = 24); }
module components() {
    color("ForestGreen") m_pi_pcb();
    color("Silver") m_pi_usb();
    color("DimGray") m_pi_cooler();
    color("Black") m_pi_gpio();
    color("LightSteelBlue") m_battery();
    color("RoyalBlue") m_boost();
    color("Purple") m_amp();
    color("Silver") m_tp4056_jack();
    color("Gold") m_tp4056_pcb();
    color("Black") m_switch();
    color([0.15, 0.15, 0.15]) m_speaker();
    color("MediumPurple") m_mic();
    color([0.2, 0.2, 0.2]) m_ptt_switch();
    color([0.2, 0.2, 0.2]) m_rocker_switches();
}

// ---------- шаги инструкции по сборке: уже поставленное — серым, текущая деталь — зелёным ----------
step = 1; // [1:12]
c_shell = [0.96, 0.96, 0.94]; c_done = [0.72, 0.72, 0.70]; c_now = [0.46, 0.64, 0.30];
module tray_item(n) {      // поддон с плоским дном
    if (n == 1) m_magnets();
    if (n == 2) { on_back() translate([ptt_c[0], ptt_c[1], 0]) { ptt_part(); ptt_plate_part(); } m_ptt_switch(); }
    if (n == 3) { on_top() rocker_part(); m_rocker_switches(); }
    if (n == 4) m_tp4056();
    if (n == 5) m_switch();
    if (n == 6) m_speaker();
    if (n == 7) m_mic();
}
module top_item(n) {       // скруглённый верх
    if (n == 8) m_battery();
    if (n == 9) { m_boost(); m_amp(); }
    if (n == 10) m_pi();
}
module tray_map() {   // поддон: все детали на местах
    translate([0, 0, D/2]) {
        color(c_shell) back_part();
        color("Crimson") m_magnets();
        color([0.46, 0.64, 0.30]) on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_part();
        color([0.55, 0.78, 0.38]) on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_plate_part();
        color([0.2, 0.2, 0.2]) m_ptt_switch();
        color([0.17, 0.17, 0.17]) { on_top() rocker_part(); m_rocker_switches(); }
        color("Gold") m_tp4056();
        color("Black") m_switch();
        color([0.25, 0.25, 0.25]) m_speaker();
        color("MediumPurple") m_mic();
    }
}
module top_map() {    // верх, перевёрнутый внутренней стороной вверх: все детали на местах
    rotate([180, 0, 0]) translate([0, 0, -D/2]) {
        color(c_shell) front_part();
        color("LightSteelBlue") m_battery();
        color("RoyalBlue") m_boost();
        color("Purple") m_amp();
        color("ForestGreen") m_pi_pcb();
        color("Silver") m_pi_usb();
        color("DimGray") m_pi_cooler();
        color("Black") m_pi_gpio();
    }
}
module step_view() {
    if (step <= 7) translate([0, 0, D/2]) {                       // поддон лежит дном на столе
        color(c_shell) back_part();
        for (n = [1 : step]) color(n == step ? c_now : c_done) tray_item(n);
    }
    else if (step <= 10) rotate([180, 0, 0]) translate([0, 0, -D/2]) {   // верх перевёрнут внутренней стороной вверх
        color(c_shell) front_part();
        for (n = [8 : step]) color(n == step ? c_now : c_done) top_item(n);
    }
    else if (step == 11) assembly(1);
    else assembly(0);
}

// ---------- виды ----------
module assembly(explode = 0) {
    e = explode;
    color([0.96, 0.96, 0.94]) translate([0, 0, 18*e]) front_part();
    color([0.90, 0.90, 0.88]) translate([0, 0, -18*e]) back_part();
    color([0.17, 0.17, 0.17]) translate([-30*e, 0, 0]) door_part();
    color([0.46, 0.64, 0.30]) on_back() translate([ptt_c[0], ptt_c[1], 34*e]) ptt_part();
    color([0.90, 0.90, 0.88]) on_back() translate([ptt_c[0], ptt_c[1], -20*e]) ptt_plate_part();
    color([0.17, 0.17, 0.17]) translate([0, 26*e, 0]) on_top() rocker_part();
    if (e > 0) components();
    else color([0.17, 0.17, 0.17]) pwr_lever_mock();   // покупной рычажок, чтобы было видно выключатель
}

// разрез по оси X = cut_x: видно, как компоненты стоят внутри
cut_x = 0;
module section() {
    difference() { union() { assembly(0); components(); } translate([cut_x, -100, -100]) cube(200); }
}
// проверка: пересечение деталей с макетами и подвижных деталей с корпусом должно быть пустым
check = "components"; // [components, ptt, ptt_plate, rocker, door]
module clash() {
    if (check == "components") intersection() {
        union() { front_part(); back_part(); door_part(); on_back() translate([ptt_c[0], ptt_c[1], 0]) { ptt_part(); ptt_plate_part(); } on_top() rocker_part(); }
        components();
    }
    else if (check == "ptt") intersection() { union() { front_part(); back_part(); } on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_part(); }
    else if (check == "ptt_plate") intersection() { union() { front_part(); back_part(); on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_part(); } on_back() translate([ptt_c[0], ptt_c[1], 0]) ptt_plate_part(); }
    else if (check == "rocker") intersection() { union() { front_part(); back_part(); } on_top() rocker_part(); }
    else if (check == "door") intersection() { union() { front_part(); back_part(); } door_part(); }
}

// раскладка для печати: каждая деталь лежит на столе (z = 0)
module print_front()  { rotate([180, 0, 0]) translate([0, 0, -D/2]) front_part(); }                     // верхом вниз
module print_back()   { translate([0, 0, D/2]) back_part(); }                                         // плоским дном вниз
module print_door()   { translate([0, 0, L/2]) rotate([0, -90, 0]) door_part(); }                      // наружной стенкой вниз
module print_ptt()    { rotate([180, 0, 0]) translate([0, 0, -(D/2 + ptt_proud)]) ptt_part(); }         // верхом вниз
module print_ptt_plate() { translate([0, 0, -(ptt_plate_top - 1.6)]) ptt_plate_part(); }               // диском вниз, юбкой вверх
module print_rocker() { rotate([0, 90, 0]) translate([-(H/2 + 0.8), 0, 0]) rocker_part(); }             // клавишей вниз

if (part == "assembly") assembly(0);
else if (part == "bottom_view") rotate([0, 180, 0]) assembly(0);   // перевёрнут: видно плоское дно, надписи читаются
else if (part == "exploded") assembly(1);
else if (part == "section") section();
else if (part == "clash") clash();
else if (part == "step") step_view();
else if (part == "tray_map") tray_map();
else if (part == "top_map") top_map();
else if (part == "front") print_front();
else if (part == "back") print_back();
else if (part == "door") print_door();
else if (part == "ptt") print_ptt();
else if (part == "rocker") print_rocker();
else if (part == "ptt_plate") print_ptt_plate();
else if (part == "print_all") {
    print_front();
    translate([0, 125, 0]) print_back();
    translate([-90, 0, 0]) print_door();
    translate([90, 0, 0]) print_ptt();
    translate([90, -30, 0]) print_ptt_plate();
    translate([90, 30, 0]) rotate([0, 0, 90]) print_rocker();
}
