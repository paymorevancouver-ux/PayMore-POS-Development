/**
 * Production Migration Data for Paymore Surrey
 * Imported from real customer, device, and settings sheets.
 * Deduplicated by ID number (keeping most complete record).
 */

import type { Customer, InventoryItem, Employee } from '@/types';

// ── Helper: map ID type string to our enum ──
function mapIdType(raw: string): Customer['idType'] {
  const l = raw.toLowerCase().trim();
  if (l.includes('driver')) return 'drivers-license';
  if (l.includes('passport') || l.includes('international')) return 'passport';
  if (l.includes('provincial')) return 'provincial-id';
  return 'other';
}

// Clean NaN / empty
function c(v: string | null | undefined): string {
  if (!v || v === 'NaN' || v === 'null' || v === 'undefined' || v.trim() === '') return '';
  return v.trim();
}

// Normalize province
function prov(v: string): string {
  const p = c(v).toUpperCase().replace('BRITISH COLUMBIA', 'BC');
  if (['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'].includes(p)) return p;
  if (p.includes('BC') || p.includes('BRIT')) return 'BC';
  if (p.includes('AB') || p.includes('ALBERT')) return 'AB';
  if (p.includes('ON') || p.includes('ONTARIO')) return 'ON';
  if (p.includes('MB') || p.includes('MANIT')) return 'MB';
  return p || 'BC';
}

// Clean DOB
function cleanDob(raw: string): string {
  const v = c(raw);
  if (!v) return '';
  // Handle "YYYY-MM-DD HH:MM:SS" format
  const d = v.split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return '';
}

// Clean phone — normalize to (XXX) XXX-XXXX
function cleanPhone(raw: string): string {
  const v = c(raw);
  if (!v) return '';
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return v; // return as-is if can't parse
}

// Capitalize first letter of each word
function titleCase(s: string): string {
  if (!s) return '';
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

// ── RAW CUSTOMER RECORDS ──
// Each entry is [idType, idNumber, firstName, middle, lastName, dob, addr1, addr2, city, province, postal, phone, email, weight, height, sex]
const RAW_CUSTOMERS: string[][] = [
["Driver's License","123456789","Paymore","RETURN","Surrey","1111-09-16","15955 Fraser Highway","103","Surrey","BC","V4N 0Y3","(778) 783-3600","paymoresurrey@gmail.com","58","170","Male"],
["Driver's License","1674234","Brian","A","Semancik","1953-12-07","127-21009 56 Ave","","Langley","BC","V3A 0C9","604-729-2217","semancikb@gmail.com","89kg","180 cm","Male"],
["Driver's License","30280662","Karanveer","S","Grewal","2003-06-23","14514 89 Ave","","Surrey","BC","V3R 8B2","672-377-0038","karangrewalpdp38rb@gmail.com","92 kg","188 cm","Male"],
["Driver's License","3240429","Dana","Lynn","Hassan","1953-03-12","21-10045 154St","","Surrey","BC","V3R 4J5","604-928-4646","dhassan4646@gmail.com","61","168","Female"],
["Passport","S7033760","Harmanpreet","","Kaur","1997-10-17","804 13380 198 Ave","","Surrey","BC","V3T0E7","604-401-8472","harrybhagat45141@gmail.com","","","Female"],
["Driver's License","278187","Marc","D","Rousseau","1999-11-17","10 -3826 Anderson Ave","","Port Alberni","BC","V97 5B2","236-785-2958","whaatshisname333@gmail.com","1","178","Male"],
["Driver's License","6513650","Sandeep","","Rodhey","1979-09-10","13275 Waverly Pl","","Surrey","BC","V3V 6Z3","778-319-8030","srohdhey@gmail.com","1","1","Male"],
["Driver's License","8596814","Dragos","B","Mihut","1977-04-09","408-7511 120 St","","Delta","BC","V4C 0C1","778-881-8294","dragosmihut@yahoo.com","1","178","Male"],
["Driver's License","177199-080","Harnoor","Singh","Dhillon","2003-09-01","8632 223 St","","Nw","BC","T5T 7L6","672-251-2552","noordhillon228@gmail.com","1","178","Male"],
["Driver's License","4165798","Jaspal","S","Batth","1968-08-28","203-18811 72Ave","","Surrey","BC","V4N 6W7","672-822-7477","jaspal.singh727@icloud.com","","","Male"],
["Driver's License","11419890","Lucian","Guilherme","Demagalhaesnascimento","1990-05-16","Unit 300 Apt 320 Nineth Street","","Westminster","BC","V3M 3V7","604-928-8313","lucian.g1605@gmail.com","","","Male"],
["Driver's License","8835596","Sukhvir","","Singh","1990-05-13","11027 129A St","","Surrey","BC","V3T 3K9","836-863-2121","sunny_13may@yahoo.co.in","","","Male"],
["Driver's License","9311463","Saleena","","Keely","1997-01-31","15079 95 Ave","","Surrey","BC","V3R 7S3","778-223-7384","saleenakeely@hotmail.com","91","170","Female"],
["Driver's License","78154","Ahmed","","Aljanabi","1991-09-28","74-8750 Maple Grove Cre St","","Burnaby","BC","V5A 4G5","604-512-0991","ahmed.alhanabi1516@gmail.com","","","Male"],
["Driver's License","9898190","Cody","Aron","Gorse","1993-05-24","2 - 16525 8 Ave","","Surrey","BC","V4A 9C1","604-787-7467","c.gorse24@gmail.com","","","Male"],
["Driver's License","4165758","Simranjeet","Singh","Cheema","1994-08-28","203-18811 72 Ave","","Surrey","BC","V4N 6W7","604-300-0422","simranjeet.cheema22@gmail.com","","","Male"],
["Passport","AK484542","Scott","A","Mchaffie","1994-03-08","1295-Conifer St","","North Vancouver","BC","V7J 0B8","604-818-2585","scottmchaffie3883@gmail.com","","","Male"],
["Other","115402637","Gautamsinh","S","Dodiya","2003-10-07","5824 Elsom Ave","","Burnaby","BC","V5H 3A2","604-906-4359","dodgd2301@learning.fraseric.ca","65","179","Male"],
["Driver's License","8843584","Gurminder","","Shoker","1994-10-28","8981 160 St","","Surrey","BC","V4N 2X8","778-837-9429","gurminder_shoker@hotmail.com","107","178","Male"],
["Driver's License","1857734","Gurjot","","Dhaliwal","2000-03-01","18609 57 Ave","","Surrey","BC","V3S 7N2","778-878-4572","dgurjot@outlook.com","73","185","Male"],
["Driver's License","9960534","Victor","E","Oluyole","1982-12-18","9412 131A St","","Surrey","BC","V3V 6Z5","236-883-3114","voluyole@gmail.com","82","170","Male"],
["Driver's License","2314400","Rolando","B","Valerio","2001-02-26","9766 153A St","","Surrey","BC","V4R 4H9","604-961-7363","valerio.rolando@outlook.com","80","170","Male"],
["Driver's License","80959339","Gurpal","S","Gill","1981-11-27","13680 60 Ave","","Surrey","BC","V3X 2MB","778-917-2444","j.sukh2007@gmail.com","80","178","Male"],
["Other","9138732724","Blaine","","Thurier","1967-03-05","519- 1267 Marinaside Cr","","Vancouver","BC","V6Z 2X5","604-704-7035","blainethurier@gmail.com","1","1","Male"],
["Driver's License","G4350-06189-91207","Arshdeep","","Gill","1999-12-07","8044 133 A St","","Surrey","BC","V4N 0G7","647-395-4798","arshdeep307@gmail.com","","","Male"],
["Driver's License","8063011","Clayton","Bernard","Cameron","1989-08-21","134 - 200 Westhill Pl","","Port Moody","BC","V3H 1V2","778-846-4377","claytoncameron@hotmail.com","","","Male"],
["Driver's License","1825783","Vijay","Kumar","Saini","2001-09-27","18373 63 Ave","","Surrey","BC","V3S 8B1","236-881-4652","sainivijay2001@gmail.com","75","168","Male"],
["Other","9804872018","Mary","Alyssa","Jovellano","1998-12-23","169 35 83A Ave","","Surrey","BC","V4N 4V1","604-375-1223","mary.alyssa.jovellano@gmail.com","","","Female"],
["Driver's License","4665935","Fadwa","A","Ezzat","1989-11-26","11-10771 Mortfield Rd","","Richmond","BC","V7A 2W1","236-868-0481","eng.fadwa.ezzat@gmail.com","67 kg","173","Female"],
["Passport","GC048290","Biotuan","","Nguyen","1986-07-04","16433 108 Ave","","Surrey","BC","V4N 5B8","778-902-2165","ken.nguyen82@yahoo.ca","","","Male"],
["Other","9142790962","Aaron","Kuldip","Kang","1993-08-23","113 - 16528 24A Ave","","Surrey","BC","V3Z 0P4","236-863-6440","aaronkang3@gmail.com","1","1","Male"],
["Driver's License","1997762","Mohammed","","Safiq","2007-03-27","10817 142 St","","Surrey","BC","V3R 3K8","778-879-4543","owais23541@gmail.com","55","180","Male"],
["Driver's License","765882","Kevindip","Singh","Sandhu","1999-10-19","13330 Stamford Pl","","Surrey","BC","V3V 6V1","604-754-3258","kevinsandhu88@gmail.com","95","188","Male"],
["Driver's License","1899921","Joshua","Mendoza","Cabansag","2005-02-22","38- 8638 159 St","","Surrey","BC","V4N 5P7","236-516-2899","j.mendozacaban@gmail.com","54","170","Male"],
["Other","116739015","Lavjit","","Singh","1998-07-12","13964 Tallin Pl","","Surrey","BC","V3V 5X8","604-781-3149","singhlavjit9@gmail.com","96","170","Male"],
["Driver's License","829388","Samuel","Alexander","Watkins","1999-10-30","22589 Hinch Cr","","Maple Ridge","BC","V2X 7H5","778-871-0356","swatkins345@gmail.com","","","Male"],
["Driver's License","5347811","Jason","Charles","Carver","1973-01-12","22-16039 Fraser Hwy","","Surrey","BC","V4N 0G2","604-999-5308","c.jay.carver@gmail.com","89","177","Male"],
["Driver's License","1973412","Mark","Adam","Britch","1989-12-15","508-3585 146A St","","Surrey","BC","V4P 0G9","778-252-5273","markbritch@protonmail.com","85","175","Male"],
["Other","114892775","Jaspreet","","Singh","2000-11-27","Bsmt-10065 129 St","","Surrey","BC","V3T 3G6","236-591-4633","jaspreet7singhr@gmail.com","73","173","Male"],
["Driver's License","680159","Jacobe","Morey","Macdonald","1999-01-08","19566 72A Ave","","Surrey","BC","V4N 6P4","778-865-8213","jacobe.macdonald8@gmail.com","77","183","Male"],
["Driver's License","2719321","Keerit","Kaur","Brar","2002-02-07","16737 76 Ave","","Surrey","BC","V4N 6N2","672-200-7015","keeritbrar58@gmail.com","","170","Female"],
["Driver's License","2326503","Aaron","","Ma","2001-02-13","#305-833 Agnes Street","","New Westminster","BC","V3M 0B1","778-513-9276","aaronma495@gmail.com","","","Male"],
["Other","118473262","Kohl","D","Tessier","1996-08-29","#1004-9675 King George Blv","","Surrey","BC","V3T 0T7","403-795-0295","kohl.tessier@outlook.com","","","Male"],
["Other","9672312888","Olukunle","D","Olafare","1984-12-13","#113-15858 85 Ave","","Surrey","BC","V4N 0Y9","604-834-4288","olukunle.olafare@gmail.com","","","Male"],
["Other","114657941","Baljot","","Singh","2002-09-10","12688 70 Ave","","Surrey","BC","V3W 1K6","778-836-1578","singhbaljot409@gmail.com","","","Male"],
["Other","9824914694","Abdullahi","M","Noor","2004-10-09","#110-7555 120A Street","","Surrey","BC","V3W 1N4","778-871-5875","noorr6044@gmail.com","","","Male"],
["Driver's License","4658981","Abdrii","","Khoma","1999-10-28","#1607-1188 Richards Street","","Vancouver","BC","V6B 3E6","425-241-6666","andrii.serg.khoma@gmail.com","","","Male"],
["Driver's License","2204674","Mubeen","A","Abrahimi","2001-02-03","#103-7175 134 Street","","Surrey","BC","V3W 4T1","778-697-4039","mubeenabrahimi@gmail.com","","","Male"],
["Driver's License","1873632","Ivoh Angelo","V","Masil","2004-02-17","#21-10038 155 Street","","Surrey","BC","V3R 0S2","604-690-2461","ivohangelo17@gmail.com","","","Male"],
["Driver's License","7481227","Travis","","Peters","1985-10-01","21405 Thornron Ave","","Maple Ridge","BC","V4R 2G6","604-618-4494","travispeters7@gmail.com","91","186","Male"],
["Driver's License","3418257","Siddhartha","Aniruddha","Kher","2000-02-24","2608-13387 Old Yale Rd","","Surrey","BC","V3T 0V6","778-538-0529","khersiddhartha@hotmail.com","","","Male"],
["Driver's License","8792586","Xiang","","Zhou","1989-06-15","11108 154St","","Surrey","BC","V3R 6J3","236-591-6716","bal890615@yahoo.com","75","183","Male"],
["Other","9864081724","Janmajor","Singh","Pooni","1998-10-14","23-9277 121 St","","Surrey","BC","V3V 0B6","672-377-2409","janmajorp@gmail.com","1","1","Male"],
["Other","109589122","Ryan","Kevin","Stark","1991-08-22","8061 264St","","Langley","BC","V1M 3M3","236-867-0551","ryan.stark0822@gmail.com","82","170","Male"],
["Other","112005000","Chirag","","Arora","2001-02-28","6253 148 Street","","Surrey","BC","V3S 2L1","236-501-8144","chirag124@icloud.com","","","Male"],
["Driver's License","5204713","Maria","Teresa","D'Alessandro","1967-10-03","102 - 1706 56 St","","Delta","BC","V4L 2R3","604-818-7639","teedee067@gmail.com","","","Female"],
["Passport","HP269632","Patrice","","Ghossein","1993-03-02","15435 Marine Dr","","White Rock","BC","V4B 1C8","250-609-8500","patriceghossein@gmail.com","","","Female"],
["Driver's License","8170909","Jason","P","Robichaud","1990-05-02","15834 94 Ave","","Surrey","BC","V4N 3B8","604-839-4255","jp.robichaud@hotmail.com","","","Male"],
["Driver's License","9783725","Charanjit","","Chahal","1985-01-10","40 8638 159 St","","Surrey","BC","V4N 5P7","778-881-1558","cs.chahal101@gmail.com","85","176","Male"],
["Driver's License","2547431","Noah","U","Schaefer","2006-09-12","#62-13789 76 Ave","","Surrey","BC","V3W 8J5","604-418-2024","utahschaefer06@gmail.com","","","Male"],
["Other","9810180417","Frank","Jacob","Ermineskin","2006-07-21","6816 195A St","","Surrey","BC","V4N 5Z7","604-401-0097","frankieak@icloud.com","","","Male"],
["Passport","T9158053","Navjot","","Kaur","2001-08-15","15069 70 Ave","","Surrey","BC","V3S 2H9","604-396-5712","navjotrubani2024@gmail.com","","","Female"],
["Driver's License","9950480","Kulnoor","","Kaur","2002-03-10","14510 59 Ave","","Surrey","BC","V3S 7B5","236-996-0236","kulnoor01@gmail.com","","","Female"],
["Driver's License","4286377","Tarandeep","Singh","Kang","1990-08-08","16166 92Ave","","Surrey","BC","V4N 3C4","647-546-1039","tarandeep.singh08@gmail.com","110","188","Male"],
["Driver's License","9703710","Akshay","Tamoghna","Mamillapalli","2004-06-24","410-13725 George Junction","","Surrey","BC","V3T 0V7","604-749-9944","akshaiytamoghna@gmail.com","","","Male"],
["Other","108520966","Martin","Roy","Andrew","1985-04-15","220-90 Alexander St","","Vancouver","BC","V6A 1B4","604-671-0665","martin.andrew@icloud.com","","","Male"],
["Other","110987870","Simranjeet","","Kaur","2000-01-19","46416 Valleyview Rd","","Chilliwack","BC","V2R 5M8","778-706-0252","simrangill2092@gmail.com","","","Female"],
["Driver's License","30574911","Ross Volkingburgh","Van","Volkingburgh","1985-05-08","1004-9675 King George","","Surrey","BC","V3T 0T7","587-338-4682","elutel@hotmail.com","","","Male"],
["Driver's License","9043706","Gulbag","Singh","Hothi","1995-12-30","15652 83 Ave","","Surrey","BC","V4N 0S2","778-344-3326","gulbaghothi@gmail.com","84","173","Male"],
["Other","116544718","Aryan","","Arora","2003-11-28","108- 13963 105 Blv","","Surrey","BC","V3T 0M9","604-783-5625","aryanarora9593@gmail.com","85","170","Male"],
["Driver's License","7699732","Thi Minh","","Pham","1976-02-28","#307-15288 105 Ave","","Surrey","BC","V3R 0W8","778-792-5865","thiminhtripham@hotmail.com","","","Female"],
["Driver's License","9171054","Anthony","","Fulop","1996-12-17","#105-2957 Glen Dr","","Coquitlam","BC","V3B0B5","778-846-9619","anthonyfulop@hotmail.com","","","Male"],
["Driver's License","30571782","Yuanzhen","","Feng","2001-02-20","#6-4588 Dubber St","","Richmond","BC","V6X 0M1","819-979-6116","caydenfung0220@gmail.com","","","Male"],
["Driver's License","8898084","Mark","A","Flores","1994-01-09","216-5588 Patterson Ave","","Burnaby","BC","V5H 0A7","778-968-0480","markserolf94@gmail.com","72","165","Male"],
["Driver's License","171057","Lucky Dexie","","Guiang","1998-10-05","15057 94A Ave","","Surrey","BC","V3R 7R1","672-552-1875","luckwuzhere@gmail.com","","","Female"],
["Driver's License","9637511","Nitin Chandra","","Akarapu","1992-07-31","#1908-13428 105 Ave","","Surrey","BC","V3T 0S6","778-389-1271","nc988598@gmail.com","","","Male"],
["Driver's License","4411054","Aline","Paffaro","Lasari","1990-03-08","2906-551 Emerson St","","Coquitlam","BC","V3J 0M4","431-688-3444","apaffaro2@gmail.com","","","Female"],
["Other","9845370158","Angad","","Saini","2002-07-25","9180 142B St","","Surrey","BC","V3V 7Y1","604-991-3094","angad919@gmail.com","","","Male"],
["Driver's License","3664411","Mika","","Stork","2003-02-23","#3316-2180 Kelly Ave","","Port Coquitlam","BC","V3C 0L1","778-386-7640","mikastork23@gmail.com","","","Male"],
["Driver's License","528083","Christopher","Jay","Gregorio","1987-03-10","15773 82A Ave","","Surrey","BC","V4N 0R6","778-995-4558","gregoriochris30@yahoo.ca","","","Male"],
["Driver's License","9452281","Julia","","Macisaac","1991-07-10","28-19897 75A Ave","","Surrey","BC","V2Y 3S2","604-354-3089","juliasoccal@gmail.com","","","Female"],
["Driver's License","9015742","Aviraj","Singh","Badesha","1996-01-01","6888 148 St","","Surrey","BC","V3S 3E2","778-859-4082","avibadesha@hotmail.com","66","178","Male"],
["Driver's License","2596272","Sandeep","Singh","Rai","2006-08-07","5930 124A St","","Surrey","BC","V3X 1X3","236-688-4433","surajsandeeprai@gmail.com","","","Male"],
["Driver's License","30175577","Stepan","","Karapetian","1999-10-01","108 - 1040 Howie Ave","","Coquitlam","BC","V3J 1T7","437-858-5946","stepanda99@gmail.com","","","Male"],
["Driver's License","158290","Len","","Elnabrees","2000-06-21","88-7780 170 St","","Surrey","BC","V4N 6M4","778-929-4984","azozaheed91@gmail.com","56","160","Female"],
["Driver's License","5857308","Coral Lei","Jane","Schweigert","1970-12-29","1405 Bishop Rd","","White Rock","BC","V4B 3K4","604-345-6545","healingconciously@gmail.com","","","Female"],
["Other","9859382364","Rohan","","Thandi","1999-10-05","15434 91A Ave","","Surrey","BC","V3R 9W8","604-417-5188","rohanthandi@gmail.com","","","Male"],
["Driver's License","436433","Rainford","","Balingoay","1999-08-10","#1508-10620 150 Street","","Surrey","BC","V3R 7K2","778-320-9804","balingoay708@gmail.com","","","Male"],
["Driver's License","8641052","Brendan","","Hay","1993-06-28","302-4250 Dawson St","","Burnaby","BC","V5C 4B1","604-897-2133","brendan.l.hay@live.ca","84","188","Male"],
["Driver's License","30295185","Karanbir","","Chhina","1993-09-29","18616 56B Ave","","Surrey","BC","V3S 7N2","778-549-2751","romy.chhina93@gmail.com","105","178","Male"],
["Driver's License","30615073","Bernadett","","Varadi","2000-11-07","9196 160 Street","","Surrey","BC","V4N 3A5","289-783-5476","varadibettike2017@gmail.com","","","Female"],
["Driver's License","6650191","Prabhdyal","S","Kang","1975-03-22","10966 129St","","Surrey","BC","V3T 3J2","778-552-2553","kangprabhdyal@hotmail.com","85","173","Male"],
["Driver's License","2214456","Kelly","Iona","Asplico","2005-05-05","15255 Sitka Dr","","Surrey","BC","V3S 0B1","778-228-9158","daBCurammeng@gmail.com","52","168","Female"],
["Driver's License","4166313","Rajeev","","Madan","1972-06-02","212/8497 Young Rd","","Chilliwack","BC","V2P 0M6","236-334-5159","rajeevmadan2@gmail.com","","","Male"],
["Passport","P7345167B","Jahmir","Nuylan","Tablate","1983-02-18","7200 Lindsay Rd Unit 303","","Richmond","BC","V7C 3M6","604-537-5675","jakolit_38@yahoo.com","1","1","Male"],
["Driver's License","9843706","Harsh","Kumar","Bathila","2004-01-28","12850 115B Ave","","Surrey","BC","V3R 2R9","604-754-1676","bathlah567@gmail.com","","","Male"],
["Other","9829598368","Pablo","","Rodriguez","2004-03-17","#131-8888 216 St","","Langley","BC","V1M 3Z8","604-308-1080","pablo.canada@icloud.com","","","Male"],
["Driver's License","8208655","Xin","Wei","Zhao","1986-12-09","1038 Madora Ave","","Coquitlam","BC","V3K 3P8","604-773-2418","royzh9@hotmail.com","","","Male"],
["Driver's License","8788388","Guramrit","","Jawanda","1994-07-17","#2206-11967 80 Ave","","Delta","BC","V4C 0E2","604-352-7167","guramritcl@gmail.com","","","Male"],
["Driver's License","8669303","Dominique","","Mongeau","1980-12-10","6318 Prince Albert Street","","Vancouver","BC","V5W 3E6","778-888-6037","dominiquemarie10@gmail.com","","","Female"],
["Other","9715319176","Leejean","V","Bagano","1984-11-14","8722 154A St","","Surrey","BC","V3S 3N9","778-933-0088","leejean.gcpi@gmail.com","","","Female"],
["Driver's License","1191569","Elliot Daniel","","Diaz","2005-03-21","#201-5 Renaissance Sq","","New Westminster","BC","V3M 6K5","778-792-7711","elliotdiaz77@icloud.com","","","Male"],
["Passport","C9786422","Trinh","D","Khoi","2006-10-16","3424 East 49th Avenue","","Vancouver","BC","V5S 1M2","(604) 715-3226","trinhdinhkhoi2006@gmail.com","","",""],
["Driver's License","506577","Huai","Y","Chen","","410-8181 Chester Street","","Vancouver","BC","V5X 0J9","(778) 522-1326","noemail@gmail.com","","",""],
["Driver's License","9840612159","Holly","D","Lawrence","2002-12-16","8043 17th Avenue","","Burnaby","BC","V3N 1M5","(778) 697-0923","hollybear_2002@hotmail.com","","",""],
["Driver's License","9220615","Matthew","Albert David","Larochelle","1996-10-24","18371 56b Avenue","","Surrey","BC","V3S 6C9","(604) 996-7975","matthewlarochelle96@gmail.com","80","178","Male"],
["Driver's License","2172451","Theodor","F","Neufeld","1957-03-08","1501 Foster Street","1701","White Rock","BC","V4B 0C3","(604) 240-1700","tfn@tesul.com","","",""],
["Driver's License","3978642","Mandep","S","Brar","2000-08-19","11720 86 Avenue","","Delta","BC","V4C 2X6","(604) 505-7879","mandeepbrar07879@gmail.com","81","180",""],
["Driver's License","5284038","Mario","M","Secondino","1972-05-04","8250 209b Street","42","Langley Township","BC","V2Y 0J7","(604) 317-0549","msecondino@hotmail.com","75","168",""],
["Driver's License","2243306","Rana Umair","Jabbar","Khan","1986-10-16","14139 100a Avenue","","Surrey","BC","V3T 1K6","(778) 882-1786","abc@gmail.com","1","180","Male"],
["Provincial ID","115456337","Elshandin","","Arthur","1998-05-22","1780 Bowser Avenue","","North Vancouver","BC","V7P 2Y5","(672) 558-1877","kofiaurthurs@gmail.com","130","178",""],
["Driver's License","8638203","Kyle","David","Jaco","1992-03-14","33601 12 Avenue","","Mission","BC","V2V 7B4","(778) 598-3224","fatherjaco@gmail.com","","",""],
["Provincial ID","114833172","Navneet","","Thind","2003-02-24","9464 132a Street","","Surrey","BC","V3V 6W5","(672) 866-2350","navneetthind914@gmail.com","53","157",""],
["Driver's License","6647126","Barry","Patrick","Leonard","1974-11-17","310 8th Street","#315","New Westminster","BC","V3M 3R3","(778) 872-5148","leonar01@telus.net","","",""],
["Driver's License","1184567","Hemant","","Kapoor","1994-11-08","3732 Marine Drive","","Burnaby","BC","V5J 3E2","(250) 513-0115","kapoor.hemant49@yahoo.com","","",""],
["Driver's License","8814539","Dian","","Chen","1985-05-25","","","Surrey","BC","V4N 1R5","(778) 928-3974","whn850525@gmail.com","1","178",""],
["Driver's License","9889549","Bharat","Shantaram","Mhaskar","1987-05-29","20834 80 Avenue","#A421","Langley Township","BC","V2Y 3M5","(778) 636-6905","bmhaskar@gmail.com","","",""],
["Driver's License","7900754","Brock","Iyahuk","Ross","1988-11-16","10910 142b Street","","Surrey","BC","V3R 3L8","(778) 697-8611","Brockrocks1988@gmail.com","1","178",""],
["Driver's License","3665534","Mohammad","Samiur","Rahman","1997-11-24","5687 182 Street","","Surrey","BC","V3S 4M5","(236) 332-5061","rahmaansamiur@gmail.com","1","178",""],
["Driver's License","8944717","Jasdeep","Singh","Gosal","1995-07-30","14550 Winter Crescent","#401","Surrey","BC","V4P 0G4","(778) 829-4507","jas-gosal@hotmail.com","","","Male"],
["Provincial ID","115781220","Gio","James","Nano","2005-03-22","10616 132 Street","#401","Surrey","BC","V3T 3V8","(778) 917-3859","giojameslouise@outlook.com","","","Male"],
["Provincial ID","110279496","Preetinder","Singh","Tuli","1978-07-19","21491 Dewdney Trunk Road","#16","Maple Ridge","BC","V2X 3G5","(604) 578-1900","preetinder.tuli@shaw.ca","","","Male"],
["Driver's License","2999240","Paul","","Pabustan","2005-09-04","15850 85 Avenue","#10","Surrey","BC","V4N 6W2","(778) 833-0904","paulpabustan03@gmail.com","","","Male"],
["Driver's License","8485258","Dillon","James","Macpherson","1989-09-01","22577 Royal Crescent","#304","Maple Ridge","BC","V2X 2M2","(604) 374-8991","dillon.macpherson@gmail.com","","","Male"],
["Driver's License","8137939","Ferdee","Camrey","Finogwar","1989-03-21","5638 201a Street","#305","Langley","BC","V3A 0L8","(236) 988-1989","ferdeec@gmail.com","","","Male"],
["Driver's License","179573","Rajan","","Saggu","1998-10-09","18983 72a Avenue","#56","Surrey","BC","V4N 1A5","(778) 919-9240","rsagg1998@gmail.com","1","178","Male"],
["Driver's License","8750813","Nicholas","Dominique","Termansen","1994-04-02","2006-550 Taylor Street","","Vancouver","BC","V6B 1N8","(604) 802-7302","nik.termansen@gmail.com","1","180","Male"],
["Driver's License","HP376007","Prabhjot","","Dhaliwal","1995-10-11","9454 126 Street","","Surrey","BC","V3V 5C5","(778) 846-3401","prabhjotdhaliwal15@gmail.com","1","180","Male"],
["Driver's License","5397644","Tammy","Jean","Parsons","1963-06-11","10659 150 Street","","Surrey","BC","V3R 4C1","(778) 987-5441","abc@gmail.com","1","178","Female"],
["Other","9794734749","Seonghoon","","Choi","1994-01-26","36-16318 82 Avenue","","Surrey","BC","V4N 0N9","(604) 417-5061","dign8846@gmail.com","1","178","Male"],
["Driver's License","2296782","Phillip","","Pham","2007-12-20","8655 159 Street","#56","Surrey","BC","V4N 1M8","(604) 729-1162","phamphillip3@gmail.com","","","Male"],
["Passport","GC657329","Vinicius","","Medeiros","1978-06-23","4494 Dumfries Street","","Vancouver","BC","V5N 3T2","(672) 377-2363","vinieros.ca@gmail.com","","","Male"],
["Other","9646020185","Zhe","M","Zhao","1970-09-29","15090 96 Avenue","","Surrey","BC","V3R 1E9","(226) 339-9931","zm11.zhao@gmail.com","","","Male"],
["Driver's License","4143954","Samuel","C","Rafuse","1990-09-18","2814 Pratt Crescent","204","Abbotsford","BC","V2S 4A7","(778) 201-2472","scharlesrafuse@gmail.com","84","183","Male"],
["Driver's License","8437406","Brendan","","Gherman","1991-12-28","10433 158 Street","#23","Surrey","BC","V4N 6S3","(778) 316-7881","Bgherman604@gmail.com","","","Male"],
["Other","9107436081","Cassandra","","Bjorndahl","1984-04-23","9312 Stuart Crescent","","Surrey","BC","V3V 1T6","(236) 788-5775","cjbjdj2012@gmail.com","","",""],
["Driver's License","9905727","Chathuranga Jayarathne","","Mudiyanselage","1985-04-24","10887 166 Street","","Surrey","BC","V4N 5E2","(236) 334-1242","wmc.jayarathne@gmail.com","","","Male"],
["Passport","C6318594","Dao","Cong","Minh","2003-03-10","4399 Oxford Street","","Burnaby","BC","V5C 1E3","(604) 842-2303","kophaibindau@gmail.com","","","Male"],
["Other","9869839072","Carlie","","Mout","1997-10-26","20653 Thorne Avenue","#15","Maple Ridge","BC","V2X 8G2","(250) 488-7541","carlie_mout@outlook.com","","",""],
["Provincial ID","113874109","Maryan","","Tam","1971-06-11","1137 Windermere Street","","Vancouver","BC","V5K 4J9","(236) 883-4658","tammaryan@yahoo.com.hk","","",""],
["Driver's License","8161206","Sara","Judith","Brown","1990-04-16","8150 207 Street","A107","Langley Township","BC","V2Y","(604) 613-5290","sarajbrown6@gmail.com","1","178",""],
["Driver's License","2961173","Yashar","","Fard","1999-11-10","16606 103 Avenue","","Surrey","BC","V4N 1Y7","(438) 455-3510","yasharh488@gmail.com","61","176","Male"],
["Driver's License","118641907","Simranjit","","Singh","2004-10-02","790 East 51st Avenue","","Vancouver","BC","V5X 1E3","(236) 777-4267","simranjit2356@gmail.com","1","178","Male"],
["Driver's License","8696458","Gursimran","Singh","Brar","","20272 27a Avenue","","Langley Township","BC","V2Z 0B6","(604) 807-6867","g_brar18@hotmail.com","1","178","Male"],
["Driver's License","115960117","Jobanpreet","","Singh","","10453 139 Street","","Surrey","BC","V3T 4L5","(778) 957-4770","jobansarao114@gmail.com","56","188","Male"],
["Driver's License","47960","Smit","","Umrethwala","1997-11-10","616 Regan Avenue","","Coquitlam","BC","V3J 0A8","(604) 218-7517","Smit59@yahoo.com","69","173","Male"],
["Driver's License","2232377","Ralph","","Arellano","2001-08-17","15477 78 Avenue","","Surrey","BC","V3S 3P3","(672) 225-6400","RALPHARELLANO17@YAHOO.COM","69","173","Male"],
["Other","9743161161","Hanbin","","Shen","1989-11-26","13765 107a Avenue","#2503","Surrey","BC","V3T 0B7","(604) 700-8643","shenwinters@gmail.com","","","Male"],
["Driver's License","9851317516","Trevor","Scott","Keen","2001-03-16","11490 232 Street","10","Maple Ridge","BC","V2X 3P1","(778) 240-8239","TRAVOEKEEN12345@GMAIL.COM","1","179","Male"],
["Driver's License","7310412","Jermaine","J","Arabe","1984-04-02","16006 90 Avenue","","Surrey","BC","V4N 2Z5","(604) 857-3885","JJARABE@HOTMAIL.COM","77","168","Male"],
["Driver's License","7829826","Theo","John","Brisley","1987-10-29","7302 193 Street","C","Surrey","BC","V4N 5Y1","(250) 801-7185","theobrisley@outlook.com","1","180","Male"],
["Other","9849129633","Raheem","","Qayum","1998-07-15","14775 67b Avenue","","Surrey","BC","V3S 4P9","(778) 858-6381","qayum70@gmail.com","","","Male"],
["Driver's License","5368714","Jing","Yan","Li","1962-10-07","2488 Latimer Avenue","","Coquitlam","BC","V3K 3J5","(778) 241-5238","aikuyo92@gmail.com","1","175","Male"],
["Driver's License","6560023","Wayne","Doughlas","Gordon","1965-12-13","590 202 Street","","Langley Township","BC","V2Z 1V7","(604) 202-1826","wdgordon999@gmail.com","1","178","Male"],
["Driver's License","9806049","Khalia","Samantha","Mcdonald","1998-09-23","2895 East 10th Avenue","#303","Vancouver","BC","V5M 0H6","(778) 872-1598","Khalia.mcdonlad23@gmail.com","","",""],
["Driver's License","30604345","Reza","","Mahmoudi","1983-03-12","2381 Bury Avenue","#308","Port Coquitlam","BC","V3C 1Z9","(604) 499-2692","r.mahmodie@gmail.com","","","Male"],
["Driver's License","7819279","Jamyang","","Tsering","1984-04-19","17841 57a Avenue","","Surrey","BC","V3S 1J3","(604) 240-4643","allstarcloverbc@gmail.com","","","Male"],
["Driver's License","30033778","Jaspreet","","Khaira","1989-09-30","19681 Wakefield Drive","","Langley","BC","V2Y 1A9","(778) 559-0024","jaspreetkhaira89@hotmail.com","","","Male"],
["Driver's License","2231007","Arash","","Moini","2005-06-14","106 San Antonio Place","","Coquitlam","BC","V3K 6W6","(604) 704-8477","arash005m@gmail.com","1","178","Male"],
["Driver's License","8138617","Ronita","Eshlyn","Prasad","1989-11-22","10020 172a Street","Bsmt","Surrey","BC","V4N 6V8","(778) 879-6148","eshlyn.prasad@fraserhealth.ca","1","176",""],
["Passport","HD691279","Hireti","","Salinas","1997-09-02","555 Delestre Avenue","","Coquitlam","BC","V3K 0A9","(672) 472-9996","hireti.iz@hotmail.com","","","Female"],
["Driver's License","115661505","Oleh","","Kovalov","1974-07-22","20053 68 Avenue","D201","Langley","BC","V2Y 0T8","(672) 377-9708","olegkovalov1974@gmail.com","98","187","Male"],
["Driver's License","118892780","Rogelio","J","Castro","1997-10-04","4745 Gladstone Street","","Vancouver","BC","V5N 5A4","(236) 660-0470","castroaguilarogeliojaj@gmail.com","79","173","Male"],
["Driver's License","6941370","Nikita","V","Mouline","1981-06-17","1050 West 10th Avenue","","Vancouver","BC","V6H 1H8","(604) 315-7767","n_mouline@hotmail.com","73","183","Male"],
["Other","9895786519","Jerad","","Mendoza","1995-07-23","9599 Number 1 Road","","Richmond","BC","V7E 1R8","(604) 704-9343","jeradmendoza@gmail.com","","","Male"],
["Driver's License","9056482","Kendace","","Pennock","1996-04-15","17258 61a Avenue","","Surrey","BC","V3S 1W3","(236) 514-5568","kandacepennock@gmail.com","","",""],
["Driver's License","9137135","Neyvone","","Tillis","1996-04-14","9500 Erickson Drive","#401","Burnaby","BC","V3J 1M8","(778) 713-3500","neyvonej@gmail.com","","","Male"],
["Driver's License","2787764","Katherine","","Bratkowski","1957-06-30","18845 58 Avenue","","Surrey","BC","V3S 7M2","(604) 329-0630","kathiebrat@shaw.ca","","",""],
["Driver's License","9278066","Andreluiz","","Sterchille","1982-10-06","1135 Windsor Mw","304","Coquitlam","BC","V3B 0L2","(778) 855-4473","andresterchille@gmail.com","1","178","Male"],
["Driver's License","2137232","Manpriya","Kaur","Nagra","2001-08-27","14848 76 Avenue","","Surrey","BC","V3S 2G9","(250) 321-7006","priyanagra@outlook.com","1","178","Female"],
["Driver's License","9101484656","Naznin","","Dhanani","1963-02-02","15138 34 Avenue","210","Surrey","BC","V3Z 0Y5","(236) 513-7869","786dhanani@gmail.com","","","Female"],
["Driver's License","6776841","Ivanchiu","Man","Chan","1981-04-02","248 West 46th Avenue","","Vancouver","BC","V5Y 2X3","(604) 307-1036","Icchal@telus.net","1","180","Male"],
["Provincial ID","118357172","Sourav","","Saini","2005-01-15","7585 156 Street","","Surrey","BC","V3S 3R1","(437) 575-1480","souravsaini75087@gmail.com","","","Male"],
["Provincial ID","116877742","Harmanjit","","Singh","2004-12-26","12295 74 Avenue","","Surrey","BC","V3W 5S3","(672) 338-9839","harmanjits540@gmail.com","","","Male"],
["Other","9698003899","Stanislav","","Hrushvytskyi","1997-08-29","831 Duthie Avenue","","Burnaby","BC","V5A 2P9","(778) 877-5428","karynaopanasiuk@gmail.com","","","Male"],
["Passport","U9352034","Akashdeep","","Singh","2003-06-15","10637 138 Street","","Surrey","BC","V3T 4K7","(778) 255-0374","AKASH150603DEEP@GMAIL.COM","","","Male"],
["Driver's License","9427080","Cristine","","Andaya","1985-10-07","5840 16 Avenue","","Delta","BC","V4L 1G9","(604) 834-3025","cristine3_bee@yahoo.com","","",""],
["Passport","W5981204","Joshua","","Abraham","1997-04-30","6017 Morgan Drive","","Surrey","BC","V3S 3L9","(604) 537-4805","jshjohnson90@gmail.com","","","Male"],
["Driver's License","30270983","Jerold","","Christian","1998-01-26","9303 Salish Court","#112","Burnaby","BC","V3J 7J8","(236) 333-7856","jarold.christian3@gmail.com","","","Male"],
["Driver's License","8077568","Ashley","","Colson","1988-10-15","9132 120 Street","#13","Surrey","BC","V3V 4B5","(604) 690-1988","ashleygcolson@gmail.com","","",""],
["Provincial ID","114955109","Syed","S","Haider","1987-01-01","4815 Eldorado Mews","#1203","Vancouver","BC","V5R 0B2","(236) 334-4154","syedsabil.cpa20@gmail.com","","","Male"],
["Driver's License","9140937919","David","C","Pratt","1984-10-27","27053 27 Avenue","","Langley Township","BC","V4W 3E7","(604) 368-8184","davidpratt198410@gmail.com","","","Male"],
["Driver's License","7311959","Jeremy","Allan","Braun","1984-05-24","10626 City Parkway","","Surrey","BC","V3T 2C5","(604) 223-7518","pwr.trrenbalone@gmail.com","1","180","Male"],
["Driver's License","9434244","Nitika","","Singh","1985-08-29","6355 128a Street","","Surrey","BC","V3X 3L9","(672) 971-9106","s.nitika@hotmail.com","71","157",""],
["Passport","AW971936","Jaspal","Singh","Sandhu","2023-07-23","85a Avenue","","Surrey","BC","V3S 2P6","(778) 522-5867","jessiesandhu23@hotmail.com","1","178","Male"],
["Passport","AJ582035","Bridget","","Addo","1990-12-07","10568 169 Street","","Surrey","BC","V4N 3H7","(780) 906-0910","brigeeadd@yahoo.com","","",""],
["Driver's License","195326","Izabel","","Postruzin","1977-06-30","14239 114 Avenue","","Surrey","BC","V3R 1P2","(672) 833-8895","matrixizabel@yahoo.com","1","174",""],
["Driver's License","8865172","Zhi","Jun","Shi","1963-08-24","8683 Oolichan Way","","Vancouver","BC","V5S 4N4","(250) 218-1997","kevinbc2009@gmail.com","1","176","Male"],
["Driver's License","30672291","Mathew","Kyle","Gilbert","1994-07-12","950 Columbia Street","","Abbotsford","BC","V2T 5X8","(519) 590-3088","GILLYYOUNG711@GMAIL.COM","1","180","Male"],
["Driver's License","7572696","Christy","Marie","Delorme","1982-08-03","20181 123 Avenue","","Maple Ridge","BC","V2X 6A7","(604) 206-3125","cellison066@gmail.com","","",""],
["Driver's License","6690491","Trasolini","","Giacomo","1979-08-26","7041 Belcarra Drive","","Burnaby","BC","V5A 1A6","(604) 619-3772","mtrasolini@hotmail.com","1","178","Male"],
["Driver's License","8951852","Taya","J","Gable","1996-05-31","20180 84 Avenue","56","Langley Township","BC","V2Y 3N5","(403) 880-9726","TJGABLE96@GMAIL.COM","55","173","Female"],
["Provincial ID","106132696","Joseph","P","Sloan","1973-06-26","3711 260 Street","","Langley Township","BC","V4W 2A9","(236) 833-4606","joesloan@hotmail.ca","","","Male"],
["Driver's License","143611","James","C","Still","1998-08-24","1322 Dog Creek Road","#8","Williams Lake","BC","V2G 3G9","(250) 305-6029","jamesstillart@gmail.com","","","Male"],
["Driver's License","9850850464","Muhammad","U","Tariq","2000-02-11","14636 79 Avenue","","Surrey","BC","V3S 2W2","(604) 726-2530","umartariq53@gmail.com","","","Male"],
["Driver's License","9047045","Chang","","Park","1992-12-29","7811 209 Street","#58","Langley Township","BC","V2Y 0P2","(778) 861-3870","changjin1229@gmail.com","","","Male"],
["Driver's License","720873","Peng","","Ye","1999-08-11","8257 19th Avenue","","Burnaby","BC","V3N 1G7","(778) 789-9161","steve_ye@icloud.com","","","Male"],
["Other","109679107","Aaron","","Pressman","1956-05-08","4840 207 Street","","Langley","BC","V3A 2E3","(604) 600-1522","APRESSMAN56@GMAIL.COM","1","180","Male"],
["Driver's License","1940268","Miguel","A","Axibal","2000-03-08","5972 150 Street","","Surrey","BC","V3S 3T3","(604) 679-7336","maxibal123@gmail.com","","","Male"],
["Driver's License","7274209","Tejinder","Singh","Sekhon","1970-08-29","10659 127 A Street","","Surrey","BC","V3V 5L7","(604) 720-7572","TAJINDERSEKHON@HOTMAIL.COM","1","178","Male"],
["Driver's License","30129142","Said Abdul Rahman","","Sayeed","","10438 148 Street","","Surrey","BC","V3R 8S9","(236) 971-9441","sayeedsaidabdulrahman@gmail.com","75","180","Male"],
["Driver's License","2825516","David","","Brownell","1957-10-11","18769 66 Avenue","","Surrey","BC","V3S 0T1","(778) 402-0244","katiebrownell@live.com","","","Male"],
["Driver's License","9975460","Deepanshu","","Deepanshu","1999-11-20","5839 Panorama Drive","","Surrey","BC","V3S 0P4","(778) 962-3100","deepanshu869904@gmail.com","1","178","Male"],
["Driver's License","30692774","Roop","","Kamal","1990-02-16","8575 Number 4 Road","","Richmond","BC","V6Y 3J4","(514) 561-8885","roopgchahal@gmail.com","","","Male"],
["Passport","AG110015","Christy","Peter","Ellison","1998-12-07","1424 Walnut Street","","Vancouver","BC","V6J 3R3","(604) 206-3125","CELLISON066@GMAIL.COM","1","178","Male"],
["Driver's License","30683354","Harnoor","Singh","Dhillon","2003-09-01","10138 Whalley Boulevard","#302","Surrey","BC","V3T 4G2","(236) 785-3442","noordhillon228@gmail.com","1","178","Male"],
["Driver's License","30235300","Tinsae","Tsegaye","Kassa","2004-07-26","15788 108 Avenue","","Surrey","BC","V4N 4N1","(236) 863-0961","jobsfoekassat@outlook.com","1","178","Male"],
["Driver's License","9717833","Mwalid","","Alsayed","1981-04-28","2402 Kitchener Avenue","","Port Coquitlam","BC","V3B 2A9","(604) 849-8838","mowaleed@gmail.com","","","Male"],
["Driver's License","5862129","Sandra","Lynn","Wilson","1971-08-14","Inez Cross","","Winnipeg","MB","R3Y","(778) 349-1027","sandramunro71@outlook.com","","",""],
["Driver's License","30183196","Roman","","Stopkin","2001-03-28","140 6th Street","30","New Westminster","BC","V3L 2Z9","(604) 362-2982","rs121nc@gmail.com","92","189","Male"],
["Driver's License","207964","James","D","Redford","1998-11-06","3357 Darwin Avenue","","Coquitlam","BC","V3B 0E8","(778) 988-3445","horizon3965@gmail.com","54","178","Male"],
["Other","9653492984","Thanh","","Truong","1996-09-15","3438 146a Street","","Surrey","BC","V4P 0J1","(587) 889-1830","kttruong14@gmail.com","","","Male"],
["Driver's License","3978700","Mark","","Lavezares","1980-05-19","9951 152 Street","203","Surrey","BC","V3R 4G5","(604) 803-5537","ganjarev@gmail.com","68","175","Male"],
["Driver's License","9138865","Cesar","Alarcon","Martinez","1978-09-30","5760 167a Street","","Surrey","BC","V3S 9T3","(604) 802-8598","riffke@gmail.com","1","178","Male"],
["Driver's License","3638049","Godofredo Jr","Torres","Escolano","1987-04-14","7311 Minoru Boulevard","","Richmond","BC","V6Y 3S8","(778) 791-7202","escolanojrjohn@gmail.com","1","178","Male"],
["Driver's License","AH403371","Panchasara","J","Soham","2003-05-24","13685 102 Avenue","","Surrey","BC","V3T 0S2","(604) 704-5484","panchasarashom002@gmail.com","","","Male"],
["Driver's License","116033990","Devansh","K","Nayyar","2009-02-26","15487 99a Avenue","Unit-68","Surrey","BC","V3R 0G9","(604) 353-3775","KRRI4H1@GMAIL.COM","55","165","Male"],
["Driver's License","8217960","Jennifer","","Matherspiper","1981-09-29","6383 140 Street","","Surrey","BC","V3W 0E9","(778) 317-4540","MATHERSJENI@AOL.COM","","",""],
["Driver's License","8471527","Steven","J","Armann","1993-06-11","15562 109 Avenue","","Surrey","BC","V3R 6E8","604-698-7181","stevenarmann@hotmail.com","91","183","Male"],
["Driver's License","1305865","Guravin","Singh","Khunga","2006-11-07","18562 56a Avenue","","Surrey","BC","V3S 7Y2","","guravinkhungha@gmail.com","1","178","Male"],
["Other","9712343725","Mohakpreet","","Singh","1999-10-29","33844 King Road","","Abbotsford","BC","V2S 7M7","236-334-6517","mohakpreet.bajwa04@gmail.com","1","178","Male"],
["Driver's License","1194573","Ronald","","Carl","1947-03-16","12961 17 Avenue","","Surrey","BC","V4A 8T7","604-818-4241","rones3@hotmail.com","82","173","Male"],
["Driver's License","7949932","Ma Raquel","","Cabinian","1969-06-07","13501 96 Avenue","404","Surrey","BC","V3V 7L9","778-858-9687","mcabinian@yahoo.com","58","160","Female"],
["Driver's License","30441895","Arun","Jayasree","Sukumar","1991-02-25","11716 82a Avenue","","Delta","BC","V4C 2E4","236-339-3355","arunjsukumaran91@gmail.com","1","180","Male"],
["Driver's License","T7324141","Simrandeep","","Kaur","2000-10-08","12700 Drummond Place","","Surrey","BC","V3V 6G3","604-499-5015","simrandechahal@gmail.com","1","176","Female"],
["Other","9712864726","Puneet","","Arora","1999-11-20","5929 168a Street","","Surrey","BC","V3S 9A3","250-879-3111","puneetarora1999@gmail.com","","","Male"],
["Driver's License","4169168","Deepak","","Verma","","4675 Imperial Street","216","Burnaby","BC","V5J 1C1","778-389-2625","dverma029@gmail.com","80","188","Male"],
["Driver's License","4788216","Aaron","","Lacroix","2005-06-28","12259 56 Avenue","","Surrey","BC","V3X 3H8","778-554-7144","aaronLacroix1233@gmail.com","80","183","Male"],
["Driver's License","4504324","Kamaljot","Singh","Doklu","2004-09-09","10870 143 Street","","Surrey","BC","V3R 3M1","604-217-2463","kdoklu@gmail.com","1","180","Male"],
["Driver's License","30181017","Quoc","Huy","Huynh","1980-01-01","4295 Old Clayburn Road","","Abbotsford","BC","V3G 0G4","825-747-1369","mowgamowga@gmail.com","1","180","Male"],
["Driver's License","3786064","Christine","","Holzhaus","1962-09-23","6834 Salisbury Avenue","","Burnaby","BC","V5E 2Z5","604-834-3025","jayandaya11@gmail.com","1","1","Female"],
["Driver's License","117834339","Shantanu","","Chauhan","2005-09-07","9791 128a Street","","Surrey","BC","V3T 3E1","778-665-1786","shantanu.chauhan0900705@gmail.com","1","180","Male"],
["Passport","AY592129","Tanbir","","Gill","1997-12-10","16765 83 Avenue","","Surrey","BC","V4N 3H5","","tanbirgill1997@hotmail.com","65","178","Male"],
["Driver's License","2270159","Ebony","","Kearns","1996-12-30","12028 99 Avenue","","Surrey","BC","V3V 0C3","778-873-0136","ebonykearns96@gmail.com","72","175","Female"],
["Driver's License","1834869","Kasenia","","Jaggard","2006-07-21","8367 155a Street","","Surrey","BC","V3S 7W7","236-889-8080","KASENIAJAGGARD@GMAIL.COM","","",""],
["Driver's License","3340206","Cheri","Youden","Eileen","1961-11-28","17190 24 Avenue","","Surrey","BC","V3Z 9Z1","604-928-4224","cheriy@me.com","1","178",""],
["Driver's License","2126976","James","R","Paradis","1955-07-27","4655 217a Street","","Langley","BC","V3A 2N8","604-202-4765","jimparadis55@gmail.com","95","185","Male"],
["Driver's License","118024706","Jagdeep","","Singh","2006-07-24","12498 60 Avenue","","Surrey","BC","V3X 2K6","604-710-2841","MAANTARN2375@GMAIL.COM","58","178","Male"],
["Driver's License","114475193","Benjamin","Earl","Niemann","1999-09-22","4953 College Highroad","","Vancouver","BC","V6T 1G7","734-575-7431","benjien@student.ubc.ca","1","1","Male"],
["Driver's License","1807802","Yonathan","T","Fissahaye","1984-02-08","1345 Kamloops Street","","New Westminster","BC","V3M 1V5","604-356-1635","yonathan_tesfamichael@yahoo.com","70","184","Male"],
["Driver's License","9851081411","Stobbart","Matthew","Stobbart","1997-12-01","15518 103a Avenue","","Surrey","BC","V3R 1N7","604-440-8402","matthewstobbart@hotmail.com","1","178","Male"],
["Driver's License","116319253","Tarun","","Sharma","2004-04-09","13308 Central Avenue","1802","Surrey","BC","V3T 5R5","","tarunsharma7018@gmail.com","80","175","Male"],
["Driver's License","9649034017","Nikita","S","Silverquill","1998-03-19","1892 Horizon Street","","Abbotsford","BC","V2S 3J4","236-512-7252","kitashaye23@gmail.com","","",""],
["Driver's License","7817901","Fangyang","","Liu","","6-9989 Barnston Dr E","","Surrey","BC","V4N 6N3","","frankie.liu.pc@gmail.com","70","180","Male"],
["Driver's License","4866202","Sahibjeet","Singh","Lamba","2001-10-23","9290 156 St","","Surrey","BC","V3R 4L2","905-514-9536","SAHIB489604@GMAIL.COM","1","180","Male"],
["Driver's License","4982249","Jhon","Anthony","Rinon","","0202-9303 Salish Crt","","Burnaby","BC","V3J 7B7","778-587-6580","rinonjehon@gmail.com","1","180","Male"],
["Driver's License","1817994","Lukas","","Kozljan","2005-04-03","114-404 Seventh St","","New Westminster","BC","V3M 3L1","672-515-0304","LUKASKOZLJAN05@GMAIL.COM","83","183","Male"],
["Driver's License","116024879","Pahnaj","","Kaur","2005-02-15","8718 165a St","","Surrey","BC","V4N 3G7","672-855-5586","PAHNAJKAUR@GMAIL.COM","45","160",""],
["Driver's License","112218310","Roopkaran","","Singh","1996-08-24","6651 203 St","","Langley","BC","V2Y 2Z2","604-655-3633","DHILLON6377@GMAIL.COM","67","178","Male"],
["Driver's License","1813400","Rami","Adnan","Essa","1974-05-04","9888 151 St","","Surrey","BC","V3R 8C9","778-706-8843","RAMIESSA74@OUTLOOK.COM","78","175","Male"],
["Driver's License","1090451","Conner","Alexander Joseph","Benard","2000-03-22","12068 204b St","","Maple Ridge","BC","V2X 1A9","778-878-2156","connerbenard222@gmail.com","80","190","Male"],
["Driver's License","518094393","James","","Kirk","1954-10-11","Apt 206, 1114 Howie Ave","","Coquitlam","BC","V3J 1V1","778-866-9530","CAPTAINJK@ME.COM","1","180","Male"],
["Provincial ID","114968442","Amandeep Singh","","Matharu","2003-10-12","1746 Happyvale Ave","","Kamloops","BC","V2B 4H5","672-338-4714","amansingh023@gmail.com","84","178","Male"],
["Driver's License","8001827","Richard","","Jackson","1988-04-08","23638 108 Loop","","Maple Ridge","BC","V2W 1B2","778-238-9235","jacksonrichardt@protonmail.com","114","178","Male"],
["Driver's License","4183453","Tuan","Anh","Ha","1994-10-01","16433 Watson Dr","","Surrey","BC","V4N 6R9","","anhha11094@hotmail.com","1","180","Male"],
["Driver's License","9913994","Navneet","Singh","Waraich","2003-01-12","315 - 10138 Whalley Blv","","Surrey","BC","V3T 4G2","604-977-7773","navxwaraich@gmail.com","95","173","Male"],
["Driver's License","64263","Andrew","","Thibault","1962-03-20","304 751 Clark Rd","","Coquitlam","BC","V3J 3Y3","236-514-7530","","82","174","Male"],
["Passport","W6464274","Harmanjot","","Singh","2004-10-15","14299 90a Ave","","Surrey","BC","V3V 7X9","437-667-1510","harman85569@gmail.com","","","Male"],
["Driver's License","2083966","Shefit","","Sopjani","2000-10-15","403 7138 Collier St","","Burnaby","BC","V5E 0A2","604-977-9147","shefitsopjani@gmail.com","","","Male"],
["Driver's License","5746463","Michael","","Woods","1961-07-31","8470 166a St","","Surrey","BC","V4N 4Z4","604-704-1975","4mwoods@gmail.com","","","Male"],
["Driver's License","30550938","Parker","","Anderson","1988-08-17","2703 1372 Seymour St","","Vancouver","BC","V6B 0L1","604-735-1717","","","","Male"],
["Driver's License","7952282","Lisa","","Nguyen","1988-09-26","15035 92 Ave","","Surrey","BC","V3R 5V8","604-671-9212","lisa_nguyenster@hotmail.com","","",""],
["Driver's License","8978604","Yonattan","","Feleke","1995-09-15","34 1909 102 Ave","","Surrey","BC","V3T 5X8","778-302-9822","yonnya995@gmail.com","55","178","Male"],
["Driver's License","W4371-75349-91201","Tyson","Gordon","Willis","1999-12-01","2437 Kelly Ave","Apt 3","Port Coquitlam","BC","V3C 1Y3","","tysonwillis46@gmail.com","1","173","Male"],
["Driver's License","8273649","Alfredo","Lat","Andaya","1984-09-06","5840 16 Ave","","Delta","BC","V4L 1G9","604-837-9467","jayandaya11@gmail.com","52","168","Male"],
["Driver's License","6439372","Julius","Augustus","Kinlocke","1975-06-03","9171 147 St","","Surrey","BC","V3R 3V6","604-329-0164","caezadon@gmail.com","68","178","Male"],
["Driver's License","1098628","Suber","Abaz","Nur","","204-13291 70B","","Surrey","BC","V3W 7Z2","778-697-4993","THEKILLHIM76@GMAIL.COM","59","185","Male"],
["Driver's License","2542750","Takara","","Nemoto","2001-07-15","203-2175 Fraser Ave","","Coquitlam","BC","V3B 0H8","604-442-5452","takaranemoto@gmail.com","78","180","Male"],
["Driver's License","4332232","Hamza","Abdi","Hassan","","110-10425 150 St","","Surrey","BC","V3R 4B2","604-866-5720","jrhamzaaa@gmail.com","80","180","Male"],
["Passport","P147637BI","Oleksandra","","Petrova","1999-07-30","1529 Elinore Cres","","Surrey","BC","V3C 2Y3","778-681-5047","SP.SASHA.PETROVA@GMAIL.COM","","","Female"],
["Driver's License","9839204964","Michael","","Mcarthur","1977-02-20","5864 Vardon Pl","","Delta","BC","V4L 1E9","825-925-3756","mcarthurmike1977@gmail.com","","","Male"],
["Driver's License","3233364","Anubhav","","Sharma","1998-06-01","486 26th Ave W","","Vancouver","BC","V5Y 2K2","604-305-3878","anubhav403@gmail.com","86","173","Male"],
["Provincial ID","111460060","Trey Jacob","","Peacock","1999-12-22","1005 13308 Central Ave","","Surrey","BC","V3T 0M4","604-364-3294","treypeacock62@gmail.com","80","180","Male"],
["Driver's License","8582068","Yi","","Lai","1993-02-17","1-5239 Oakmount Cr","","Burnaby","BC","V5H 4S6","","yi_lai@outlook.com","1","178","Male"],
["Other","5851763","Le","Nga","Chau","1971-05-31","7659 140 St","","Surrey","BC","V3W 5J9","604-779-5964","NGELECHAU71@YAHOO.COM","1","176",""],
["Driver's License","8946432","Elvin","Ramesh","Nigam","1995-07-24","6152 140B St","","Surrey","BC","V3X 0G9","778-999-3189","ALVIN.NIGAM@GMAIL.COM","73","180","Male"],
["Driver's License","9651292","Rochelle Barb","","Pinon","1989-07-16","3660 Lillooet St","","Vancouver","BC","V5M 3P8","604-781-1664","MOOCHIEPYTHON@GMAIL.COM","1","175",""],
["Driver's License","7229658","Saurabh","","Jolly","1982-02-06","5-9405 121 St","","Surrey","BC","V3V 0A9","604-753-8458","SAURABHJOLLY555@GMAIL.COM","82","160","Male"],
["Provincial ID","113539159","Ramanpreet","","Kaur","2001-04-16","10180 Williams Rd","","Richmond","BC","V7A 1H4","672-336-1135","raman2001preet16kaur@gmail.com","","","Female"],
["Driver's License","8668731","Oliver","","Sommer","1975-04-29","B106 14881 104 Ave","","Surrey","BC","V3R 1M6","604-441-6661","oliversommer@gmail.com","84","179","Male"],
["Driver's License","N09757090990510","Shonik","","Nayyar","1999-05-10","17825 59 Ave","","Surrey","BC","V3S 1P6","672-272-0108","NAYYARSHONIK@GMAIL.COM","","","Male"],
["Driver's License","116664517","Jaskaran","","Singh","2004-11-30","16023 89a Ave","","Surrey","BC","V4N 2Z4","778-962-6207","kalerkaran51@gmail.com","","","Male"],
["Provincial ID","117476058","Harjot","","Singh","2000-07-21","6738 150B St","","Surrey","BC","V3S 9G9","672-399-3704","btxbeller@gmail.com","","","Male"],
["Other","9893431283","Jagroop","","Takhar","1995-09-07","8256 170 St","","Surrey","BC","V4V 4V2","236-978-2003","jag958256@gmail.com","","","Male"],
["Other","113743381","Nishant","","Kohli","1983-04-02","417-14968 101a Ave","","Surrey","BC","V3R 0E8","604-338-0081","nish.kohli83@gmail.com","78","180","Male"],
["Driver's License","9535653","Ricozi","Xuan","Wen","","8567 125St","","Surrey","BC","V3W 2V5","778-889-9129","rzxwen01@gmail.com","50","180","Male"],
["Driver's License","7391053","Gurpreet","Singh","Khaira","1977-09-02","8-16388 85 Ave","","Surrey","BC","V4N 5G2","604-518-2824","GURPREETKHAIRA7@GMAIL.COM","","","Male"],
["Driver's License","7356519","Aatish","Chand","Maharaj","1979-06-18","12315 92 Ave","","Surrey","BC","V3V 1G3","604-764-1081","aatish.maharaj@yahoo.com","82","180","Male"],
["Driver's License","6441803","Jennifer","Carrie","Darling","1979-04-16","3648 Hughes Pl","","Port Coquitlam","BC","V3B 5C6","778-388-6575","jenjagger152@gmail.com","73","168",""],
["Driver's License","8754152","Breannemay","","Jackson","1991-07-16","","","Surrey","BC","V2W 1B2","","breanne.landry@outlook.com","1","163","Female"],
["Driver's License","3613001","Michael Steven","Roy","Hanrahan","1984-09-23","409-111 Pacific St","","Vancouver","BC","V6E 3X7","604-788-4637","hanrahan.steve@gmail.com","95","201","Male"],
["Driver's License","4716225","Christine","","Mcgowan","2001-12-01","33140 Huntingdon Rd","","Abbotsford","BC","V2S 7Z3","236-313-3073","christinemcgowan75@gmail.com","","","Female"],
["Driver's License","511374","Adam","","Arboleda","2003-02-20","16659 18 Ave","","Surrey","BC","V3Z 9X5","236-234-3152","ADAM123ARBOLEDA@GMAIL.COM","","","Male"],
["Driver's License","9809995","Harkanwar","","Gulri","1990-08-21","13030 111 Ave","","Surrey","BC","V3T 2R9","778-709-2198","kanwar_003@hotmail.com","92","175","Male"],
["Driver's License","30169588","Gautam","","Dherander","2001-08-27","5812 124A St","","Surrey","BC","V3X 1X3","778-862-7446","dherandergautam@gmail.com","92","183","Male"],
["Driver's License","2000293","Ibarra","Mario","Luis Jr","2005-10-15","14377 88Ave","","Surrey","BC","V3W 3L8","778-723-8408","mj.ibarra@gmail.com","59","168","Male"],
["Driver's License","7910749","Patrick","Sean Kyle","Shum","1987-12-23","7054 177A St","","Surrey","BC","V3S 7V3","604-209-2940","PSCHUM1@GMAIL.COM","66","208","Male"],
["Provincial ID","9108768499","Mark","Leon","Davis","1986-02-23","4015 Parker St","","Burnaby","BC","V5C 3B8","604-349-1424","markdevis4015p@gmail.com","1","1","Male"],
["Driver's License","9872997","Susanne","","Wentzell","1977-04-06","13804 102 Ave","","Surrey","BC","V3T 1P1","778-386-3736","sussannewentzell@yahoo.com","","","Female"],
["Driver's License","30169562","Abhijeet","","Ryait","1989-07-24","44 16127 87 Ave","","Surrey","BC","V4N 6R3","672-200-9255","aaby247@gmail.com","140","175","Male"],
["Driver's License","114257690","Alaap","","Singh","2000-08-29","13378 63a Ave","","Surrey","BC","V3X 1L6","604-771-2634","alaapsingh4436@gmail.com","74","180","Male"],
["Driver's License","868763","Matabh","Singh","Doel","1999-11-30","","7471 144a St","Surrey","BC","V3S 0S3","778-709-6299","matabhdoel@gmail.com","82","185","Male"],
["Other","9141790755","Nicholas","","Blunt","1993-06-28","29-16039 Fraser Hwy","","Surrey","BC","V4N 0G2","236-558-7911","bluntnick4@gmail.com","","","Male"],
["Driver's License","PD4040593","Durga","Malleshwar","Vemuri","1998-06-10","13733","","Surrey","BC","V3T 0B7","778-879-9387","ESWARKUMAR276@GMAIL.COM","180","180","Male"],
["Driver's License","9183093","Sandeep","","Sharma","1986-09-24","113 / 12160 80 Ave","","Surrey","BC","V3W 0V3","604-729-9003","taajdeep24@gmail.com","89","180","Male"],
["Driver's License","7142675","Christopher","A","Marfori","1982-09-22","","25-15868 85th Ave","Surrey","BC","V4N 0Y9","778-926-3415","chrismarfori@gmail.com","100","183","Male"],
];

// ── BUILD DEDUPLICATED CUSTOMERS ──
export function buildCustomers(): Customer[] {
  const seen = new Map<string, Customer>();
  const now = new Date().toISOString();
  let codeNum = 10001;

  RAW_CUSTOMERS.forEach((r) => {
    const idNum = c(r[1]);
    if (!idNum) return;

    const firstName = titleCase(c(r[2]));
    const lastName = titleCase(c(r[4]));
    if (!firstName && !lastName) return;

    // Clean weight/height — strip units
    const wRaw = c(r[13]).replace(/kg/gi, '').replace(/cm/gi, '').trim();
    const hRaw = c(r[14]).replace(/cm/gi, '').replace(/kg/gi, '').trim();

    const customer: Customer = {
      id: `CUS-M${String(codeNum).padStart(5, '0')}`,
      customerCode: `C-${codeNum}`,
      idType: mapIdType(r[0]),
      idNumber: idNum,
      firstName,
      middleName: titleCase(c(r[3])),
      lastName,
      dob: cleanDob(r[5]),
      address1: c(r[6]),
      address2: c(r[7]),
      city: titleCase(c(r[8])),
      province: prov(r[9]),
      postalCode: c(r[10]).toUpperCase(),
      phone: cleanPhone(r[11]),
      email: c(r[12]).toLowerCase(),
      sex: titleCase(c(r[15])) || '',
      race: '',
      weight: wRaw,
      height: hRaw,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };

    // Deduplicate: keep the most complete record by ID number
    const existing = seen.get(idNum);
    if (existing) {
      // Merge: fill empty fields from new record
      const merged = { ...existing };
      if (!merged.firstName && customer.firstName) merged.firstName = customer.firstName;
      if (!merged.lastName && customer.lastName) merged.lastName = customer.lastName;
      if (!merged.middleName && customer.middleName) merged.middleName = customer.middleName;
      if (!merged.dob && customer.dob) merged.dob = customer.dob;
      if (!merged.address1 && customer.address1) merged.address1 = customer.address1;
      if (!merged.address2 && customer.address2) merged.address2 = customer.address2;
      if (!merged.city && customer.city) merged.city = customer.city;
      if (!merged.phone && customer.phone) merged.phone = customer.phone;
      if (!merged.email && customer.email) merged.email = customer.email;
      if (!merged.weight && customer.weight) merged.weight = customer.weight;
      if (!merged.height && customer.height) merged.height = customer.height;
      if (!merged.sex && customer.sex) merged.sex = customer.sex;
      seen.set(idNum, merged);
    } else {
      seen.set(idNum, customer);
      codeNum++;
    }
  });

  return Array.from(seen.values());
}

// ── RAW DEVICE/INVENTORY RECORDS ──
// [deviceCode, visitId, category, brand, model, serialImei, qty, costPerUnit, status]
const RAW_DEVICES: string[][] = [
["DEV-00006","BC-01-5071","Drone","DJI","Air 3","CCAQ23LPO33OT2","1","1250","Available"],
["DEV-00015","BC-01-5071","Mouse","Logitech","M650i","2527ap30py19","1","10","Available"],
["DEV-00017","BC-01-5071","Mouse","Logitech","M550","2522ap8m5e39","1","5","Available"],
["DEV-00018","BC-01-5071","Mouse","Logitech","Ergo M575 S","2521APRCEJB9","4","17.5","Available"],
["DEV-00020","BC-01-5071","Mouse","Corsair","Scimitar RGB Elite","A1NJD5236346BE","3","22.5","Available"],
["DEV-00022","BC-01-5071","Mouse","Razer","Deathadder Essential","902524H19502543","1","5","Available"],
["DEV-00023","BC-01-5071","Mouse","Razer","Deathadder X Hyperspeed","632533H22310222","1","10","Available"],
["DEV-00026","BC-01-5071","Drone","DJI","Mini 3 - Parts Only","1581F5YHC22CG00296E5","1","150","Available"],
["DEV-00027","BC-01-5194","Laptop","Apple","Macbook Air M2","kv3t6xdql3","1","550","Available"],
["DEV-00034","BC-01-5201","Ear Buds","JBL","Tune Beam 2","8500B","1","15","Available"],
["DEV-00036","BC-01-5203","Other","Gaems","Vanguard G190","859840002343","1","200","Available"],
["DEV-00040","BC-01-5206","Camera","Logitech","Quickcam Orbit AF","97855047816","1","5","Available"],
["DEV-00042","BC-01-5206","Other","Microsoft","Wireless Mouse 3500","885370202175","8","5","Available"],
["DEV-00043","BC-01-5206","Other","Logitech","M570 Wireless Trackball","1923lzd2b879","3","5","Available"],
["DEV-00051","BC-01-5213","Monitor","Samsung","4K UHD Curved Monitor","U32R591C","1","70","Available"],
["DEV-00052","BC-01-5214","Camera","JBL","Live 660NC","NV","1","15","Available"],
["DEV-00058","BC-01-5218","Phones","Google Pixel","Pixel 4A","357511107856424","1","10","Available"],
["DEV-00065","BC-01-5221","Camera","Apple","5th Gen 1421","","1","5","Available"],
["DEV-00066","BC-01-5223","Android Tablet","Asus","Nexus 7","MOB30X","1","5","Available"],
["DEV-00073","BC-01-5227","Camera","Panasonic Lumix","DMC G7","WE8BD001924","1","450","Available"],
["DEV-00080","BC-01-5233","Keyboard","Logitech","Pro Tenkeyless","2218MR378A28","1","20","Available"],
["DEV-00081","BC-01-5235","Phones","Samsung","Core Lite 16GB","354696064467597","1","5","Available"],
["DEV-00085","BC-01-5238","Speaker","Monster","Adventure Max","MS221012450100173","1","30","Available"],
["DEV-00088","BC-01-5241","iPad","Apple","A1822","DMPVKHZQHLF9","1","20","Available"],
["DEV-00092","BC-01-5241","Other","Lenovo","Gen2 USB Keyboard And Mouse","","1","5","Available"],
["DEV-00094","BC-01-5241","Speakers","Monster Power","Power Bar 1100","mpb1100","1","5","Available"],
["DEV-00097","BC-01-5242","Monitor","MSI","Tobapa","CA8A553100154","1","40","Available"],
["DEV-00099","BC-01-5242","Processor","AMD","Ryzen 5000 Series","9KT7674R30329","1","30","Available"],
["DEV-00100","BC-01-5242","Camera","AverMedia","PW513","5203676400100","1","10","Available"],
["DEV-00101","BC-01-5243","Mini CPU","Lenovo","Thinkcentre Neo 50Q","MZ00PER1","1","50","Available"],
["DEV-00106","BC-01-5247","iPad","iPad","Gen 1 27 GB","DKvpj01ndvd2","1","10","Available"],
["DEV-00107","BC-01-5247","iPad","Mini 4","128 GB","C39GR0DMDTDM","1","20","Available"],
["DEV-00109","BC-01-5249","iPad","Apple","iPad Air 2 A1566","dqtnp0vqg5vj","1","0","Available"],
["DEV-00114","BC-01-5253","Camera","Sansui","ES-24F1","xec22015700752","1","10","Available"],
["DEV-00117","BC-01-5256","Macbook","Apple","Mac Pro A1186","G88302RKXYL","1","40","Available"],
["DEV-00125","BC-01-5261","Other","Apple","iPod","","1","5","Available"],
["DEV-00126","BC-01-5261","Macbook","Apple","A1286","","1","10","Available"],
["DEV-00129","BC-01-5263","HDD And SSD","Intel","Intel Raid 1 Volume","","1","20","Available"],
["DEV-00130","BC-01-5264","Drones","DJI","Mini 5 Pro","1581F9DEC257E0292GHM","1","1100","Available"],
["DEV-00134","BC-01-5267","Other","Apple","SS Milanese Loop & Other","","3","35","Available"],
["DEV-00139","BC-01-5272","Phones","Samsung","Galaxy S25 Ultra (Cloned)","356103825375977","1","50","Available"],
["DEV-00140","BC-01-5273","Monitor","Acer","Predator XB283K","MMTSVAA001242146EF4200","1","30","Available"],
["DEV-00147","BC-01-5279","Laptop","Lenovo","Ideapad 1","PF46TKJW","1","15","Available"],
["DEV-00149","BC-01-5281","Tablet","Lenovo","TB-X104F","android8.1.0","1","10","Available"],
["DEV-00160","BC-01-5292","Mouse","Logitech","MX Master 4","","1","60","Available"],
["DEV-00163","BC-01-5294","Other","Magic Refiner","MK26 Gaming Keyboard","123456789","1","5","Available"],
["DEV-00164","BC-01-5294","Other","Razer Mouse X 2","Hyperx / Viper Mini","123456789","1","5","Available"],
["DEV-00166","BC-01-5295","Other","Sony PS5","Video Game","NV","1","20","Available"],
["DEV-00169","BC-01-5299","Other","Pro+ Adapter + SD Card","","NV","1","20","Available"],
["DEV-00175","BC-01-5304","Other","G.Skill","SO-DIMM","F3-8500CL7S-2GBSQ","1","5","Available"],
["DEV-00176","BC-01-5304","Other","Crucial","Mac 4GB DDR3","CT51264BC1339","1","5","Available"],
["DEV-00177","BC-01-5304","Other","Seagate","500GB","BARRACUDA 7200","1","5","Available"],
["DEV-00178","BC-01-5304","Other","Apple","Touch Pad","A1339","1","5","Available"],
["DEV-00184","BC-01-5308","Graphics Card","MSI","GeForce RTX 4060Ti","602-V512-08SB2404004240","1","40","Available"],
["DEV-00186","BC-01-5310","Graphic Card","Power Color","AXRX 5700XT","4713436172529","1","70","Available"],
["DEV-00187","BC-01-5310","RAM","Corsair","Vengeance LPX DDR4 16GB","233704423431788","1","30","Available"],
["DEV-00188","BC-01-5310","RAM","G.Skill","Ripjaws 4","24262632790","1","10","Available"],
["DEV-00190","BC-01-5310","SSD","Western Digital","512 GB NVMe","18348800277","1","10","Available"],
["DEV-00193","BC-01-5312","Other","Sony Player","DVP-SR500H","7129931","1","5","Available"],
["DEV-00195","BC-01-5314","Other","Godox","V350C","2ABYNV350","1","15","Available"],
["DEV-00196","BC-01-5314","Other","Pioneer","DVD Recorder","DVR-533H","1","10","Available"],
["DEV-00197","BC-01-5314","Other","Hitachi","Cassette Player","D-E22","1","10","Available"],
["DEV-00198","BC-01-5314","Other","Sanyo","DVD Video Recorder","DRW-1000","1","10","Available"],
["DEV-00199","BC-01-5314","Other","Pioneer","CD Recorder Multi Cassette","PDR W-839","1","40","Available"],
["DEV-00200","BC-01-5314","Other","Canon","EFS 18-55MM Lens","NV","1","10","Available"],
["DEV-00205","BC-01-5319","Other","Skullcandy","Crusher Wireless","NV","5","30","Available"],
["DEV-00208","BC-01-5322","SSD","Kingston","SBFKB1D1 120GB","","1","5","Available"],
["DEV-00209","BC-01-5322","RAM","Micron, G.Skill","DDR3 4GB","","1","5","Available"],
["DEV-00211","BC-01-5323","RAM","Corsair","Vengeance DDR4","232904052715168","1","10","Available"],
["DEV-00213","BC-01-5325","Keyboard","Hermes","E1C 3-in-1 Gaming Combo","2D7221809808","1","20","Available"],
["DEV-00214","BC-01-5325","Keyboard","Steelseries","Apex Pro TKL V2","647343732338220","1","20","Available"],
["DEV-00220","BC-01-5330","Watch","Apple","2nd Gen WiFi","MXC4WCM71R","1","25","Available"],
["DEV-00233","BC-01-5339","Macbook","Apple","MacBook Pro 14\" (2023) 30 Core GPU","QK5W7PM4F1","1","1250","Available"],
["DEV-00238","BC-01-5343","Other","HP","RAM Keyboard Mouse","NV","1","15","Available"],
["DEV-00240","BC-01-5345","Tablet","Samsung","S10 Ultra 256 GB","R52XB04WLXX","1","550","Available"],
["DEV-00241","BC-01-5345","Headphones","Apple","Gen 1","SH3NMH0JMLX2Y","1","50","Available"],
["DEV-00242","BC-01-5346","Hard Drive","WD Black","2TB WD2003FZEX SATA 6GB/s","wcc6n4dtmtz2","1","50","Available"],
["DEV-00243","BC-01-5347","Other","Addtam","Surge Protector","NV","1","5","Available"],
["DEV-00244","BC-01-5347","Other","UGREEN","TUV Adapter","NV","1","10","Available"],
["DEV-00245","BC-01-5347","Other","UGREEN","CM570 HDMI Splitter","NV","1","10","Available"],
["DEV-00250","BC-01-5352","Phones","Samsung Galaxy","Z Flip 7","351973980706660","1","550","Available"],
["DEV-00253","BC-01-5354","Phones","Apple","iPhone 8 64 GB","","1","30","Available"],
["DEV-00254","BC-01-5355","Other","Patriot","Viper 2x8GB RAM","PV316G160C0K","1","10","Available"],
["DEV-00255","BC-01-5355","SSD","Seagate","Barracuda 1TB","9VX0NMJ8","1","15","Available"],
["DEV-00261","BC-01-5360","Other","Lenovo","Type-C Charger","","24","3","Available"],
["DEV-00267","BC-01-5366","Games","Nintendo","DS & 3DS Games (Lot)","045496742812","1","85","Available"],
["DEV-00268","BC-01-5366","Camera","Polaroid","Lab & Go","","1","40","Available"],
["DEV-00271","BC-01-5369","Other","Xbox","360 Controller","M1138823-002","1","10","Available"],
["DEV-00279","BC-01-5375","Phones","LG","Nexus 4","LG-E960","1","10","Available"],
["DEV-00280","BC-01-5375","Other","Apple","Magic Keyboard","A1314","1","10","Available"],
["DEV-00281","BC-01-5375","Other","Apple Mouse","A1657","CC2644417U7","1","5","Available"],
["DEV-00282","BC-01-5375","Other","Apple Mouse","A1296","5VDC","1","5","Available"],
["DEV-00283","BC-01-5375","Other","Apple","iPod MA623C","1C827A1J14N","1","5","Available"],
["DEV-00291","BC-01-5380","Phones","Samsung","A13","353011240871251","1","40","Available"],
["DEV-00297","BC-01-5386","Other","Gigabyte","GV-R66Eagle 8 GD","4719331309923","1","70","Available"],
["DEV-00302","BC-01-5390","PS5 Gaming Portal","Sony","PS5 Portal CFI-Y1001","H154011W910346215","1","150","Available"],
["DEV-00304","BC-01-5391","Other","HGST","1 TB","6PH7UTDE","1","25","Available"],
["DEV-00305","BC-01-5391","Other","Corsair","Keyboard K70","35617283702","1","10","Available"],
["DEV-00311","BC-01-5397","Other","Phonak Audeo","Hearing Aid I 50R","25451x2g","1","200","Available"],
["DEV-00314","BC-01-5400","Macbook","Apple","M1 Pro 10-Core, 16-Core GPU","CJ7DW5XV72","1","680","Available"],
["DEV-00319","BC-01-5402","GPU","Zotac Gaming","1660 Ti 6GB GDDR6","N201100020982","1","45","Available"],
["DEV-00320","BC-01-5403","Other","Panasonic","Landline KXTGF372C","NV","1","20","Available"],
["DEV-00326","BC-01-5409","Other","Cool Master","500 Elite 500W PSU","","1","10","Available"],
["DEV-00327","BC-01-5409","Other","HGST","1 TB","170204JA109NDW2MHWKS","1","15","Available"],
["DEV-00330","BC-01-5412","Other","Apple","Watch Series 11 42MM","LJY0PQF2CN","1","380","Available"],
["DEV-00332","BC-01-5414","Laptop","Asus TUF","F15 FX507ZM","N6NRCX05M772247","1","520","Available"],
["DEV-00335","BC-01-5417","Monitor","Alienware","AW2721D","CN-0XW3CK","1","250","Available"],
["DEV-00336","BC-01-5417","Monitor","Acer","Predator XB253Q","mmth5aa00303006a","1","40","Available"],
["DEV-00337","BC-01-5417","Other","Sony","CFI-ZCT1W Controller","NV","1","15","Available"],
["DEV-00338","BC-01-5417","Other","SK Hynix","DDR5 SODIMM","80AD01224987314CA9","1","70","Available"],
["DEV-00340","BC-01-5417","Other","Razer","Deathadder Hyperspeed","102434H32503291","1","20","Available"],
["DEV-00344","BC-01-5421","iPad","Apple","6th Gen / 32GB","DMPWF0Z7JF8K","1","25","Available"],
["DEV-00349","BC-01-5422","Other","Nintendo","Wii U Screen WUP-010","jw413457781","1","50","Available"],
["DEV-00350","BC-01-5423","Projector","LG","ProBeam BU60PST 6000 Lumen 4K","307NTPC3K840","1","1100","Available"],
["DEV-00351","BC-01-5424","Smart Watch","Apple","Series 9 / 45mm / GPS","gf3q5ccph4","1","120","Available"],
["DEV-00352","BC-01-5425","Phones","Apple","iPhone 12 128GB Black / 84%","35850311261507","1","150","Available"],
["DEV-00355","BC-01-5427","Other","Afterglow","Xbox 360 Controller","pl3602","1","5","Available"],
["DEV-00356","BC-01-5428","Macbook","Apple","Macbook Pro M4 16GB 512GB","k6tyhfvxd7","1","1050","Available"],
["DEV-00357","BC-01-5429","Laptop","Microsoft","Surface Pro 7 Snapdragon Elite","OF3FMX824303HH","1","450","Available"],
["DEV-00358","BC-01-5430","Other","Dell","XPS","NV","1","25","Available"],
["DEV-00359","BC-01-5431","Other","Micron","Crucial 2.5\"","14390D5EE0CE","1","10","Available"],
["DEV-00360","BC-01-5431","Other","Samsung","MZ-JPU256T/OA6","S1K4NYCFB09284","1","5","Available"],
["DEV-00362","BC-01-5433","GPU","Asus","ROG Strix RTX4090 24G","RCYVMX0144073YM","1","350","Available"],
["DEV-00363","BC-01-5434","Phones","Apple","16 Pro Max 256 GB 100%","357849370882911","1","800","Available"],
["DEV-00365","BC-01-5436","Phones","Google","Pixel 9 Pro 128 GB","351311330477031","1","370","Available"],
["DEV-00366","BC-01-5437","Other","Samsung","Vnamo 870 Evo 1TB","S6PTNZ0RA05337Z","1","40","Available"],
["DEV-00368","BC-01-5439","Laptop","Asus","F16 32GB 1TB RTX 4050","T8NRKD01L146326","1","420","Available"],
["DEV-00369","BC-01-5440","Macbook","Apple","M1 2020","HXJKX4JF1WFV","1","310","Available"],
["DEV-00371","BC-01-5442","Controller","Xbox One","1708","3600325642634","1","15","Available"],
["DEV-00372","BC-01-5443","Keyboard","Apple","Magic Keyboard","r177wyhfp0","1","150","Available"],
];

export function buildInventory(): InventoryItem[] {
  const now = new Date().toISOString();
  return RAW_DEVICES.map((r) => {
    const serial = c(r[5]);
    // Convert legacy DEV-XXXXX format to new BC01-XXXXXX (6-digit padded) format for Surrey
    const numMatch = r[0].match(/(\d+)$/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    const deviceCode = `BC01-${String(num).padStart(6, '0')}`;
    return {
      id: `INV-${String(num).padStart(5, '0')}`,
      deviceCode,
      category: r[2],
      brand: r[3],
      model: r[4],
      serialImei: serial === 'NV' ? '' : serial,
      quantityOnHand: parseInt(r[6]) || 1,
      costPerUnit: parseFloat(r[7]) || 0,
      expectedSalePrice: 0,
      status: 'available' as const,
      storeId: 'STR-001',
      acquiredAt: now,
      soldAt: null,
      notes: '',
      // Storage location & label tracking (new fields, default empty)
      storageLocation: null,
      storageRack: null,
      storageRow: null,
      labelGenerated: false,
      labelGeneratedAt: null,
      labelGeneratedBy: null,
      labelPrintCount: 0,
      lastLabelPrintAt: null,
      lastLabelPrintBy: null,
    };
  });
}

// ── PRODUCTION EMPLOYEES ──
export const PROD_EMPLOYEES: Employee[] = [
  { id: 'E001', fullName: 'Nirmal Singh', email: 'nirmal@paymoresurrey.ca', pin: '5486', role: 'admin', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
  { id: 'E002', fullName: 'Simran Singh', email: 'simran@paymoresurrey.ca', pin: '4695', role: 'manager', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
  { id: 'E003', fullName: 'Suneet Vats', email: 'suneet@paymoresurrey.ca', pin: '8143', role: 'manager', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
  { id: 'E004', fullName: 'Abhishek Pundir', email: 'abhishek@paymoresurrey.ca', pin: '4668', role: 'manager', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
];

// ── PRODUCTION SETTINGS ──
export const PROD_SETTINGS = {
  nextVisitNumber: 5444,
  nextDeviceNumber: 373,
  nextSaleNumber: 351,
  openingBalance: 5000,
  currentBalance: 1645,
};
