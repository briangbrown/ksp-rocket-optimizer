import React, { useState, useMemo, useEffect, useRef } from "react";

/* ============================== STOCK + DLC PART DATA ==============================
   Extracted from niobos/ksp-tools and verified against stock KSP 1.12.5 values.
   Engines store mass-flow; thrust = Isp * g0 * mdot, which is how KSP computes it.
   f = fuel types, iv/ia = Isp vacuum/ASL, fv/fa = thrust vacuum/ASL (kN),
   m = wet mass, dry = mass without integrated propellant (SRBs), t = tech node.
   Tanks: k = structural (dry) mass per tonne of propellant. Stock LF/Ox tanks = 0.125.
=================================================================================== */
const DATA = {"engines":[{"n":"24-77 \"Twitch\" Liquid Fuel Engine","m":0.08,"dry":0.08,"fuelM":0,"cost":230,"sz":["R"],"gim":8.0,"iv":290,"ia":275,"fv":16,"fa":15.2,"f":["LF","Ox"],"t":"Precision Propulsion"},{"n":"48-7S \"Spark\" Liquid Fuel Engine","m":0.13,"dry":0.13,"fuelM":0,"cost":240,"sz":["0"],"gim":3.0,"iv":320,"ia":265,"fv":20,"fa":16.6,"f":["LF","Ox"],"t":"Propulsion Systems"},{"n":"BACC \"Thumper\" Solid Fuel Booster","m":7.65,"dry":1.5,"fuelM":6.15,"cost":850,"sz":["1","R"],"gim":0.0,"iv":210,"ia":175,"fv":300.1,"fa":250.1,"f":["SF"],"t":"General Rocketry"},{"n":"CR-7 R.A.P.I.E.R. Engine","m":2,"dry":2,"fuelM":0,"cost":6000,"sz":["1"],"gim":3.0,"iv":305,"ia":275,"fv":180.1,"fa":162.4,"f":["LF","Ox"],"t":"Aerospace Tech"},{"n":"F3S0 \"Shrimp\" Solid Fuel Booster","m":0.825,"dry":0.15,"fuelM":0.675,"cost":150,"sz":["0","R"],"gim":0.0,"iv":215,"ia":190,"fv":30,"fa":26.5,"f":["SF"],"t":"Precision Propulsion"},{"n":"FM1 \"Mite\" Solid Fuel Booster","m":0.375,"dry":0.075,"fuelM":0.3,"cost":75,"sz":["0","R"],"gim":0.0,"iv":210,"ia":185,"fv":12.5,"fa":11,"f":["SF"],"t":"Propulsion Systems"},{"n":"IX-6315 \"Dawn\" Electric Propulsion System","m":0.25,"dry":0.25,"fuelM":0,"cost":8000,"sz":["0"],"gim":0.0,"iv":4200,"ia":100,"fv":2,"fa":0,"f":["Xe"],"t":"Ion Propulsion"},{"mh":1,"n":"Kerbodyne KE-1 \"Mastodon\"","m":5,"dry":5,"fuelM":0,"cost":22000,"sz":["1","1.5","2"],"gim":5,"iv":290,"ia":280,"fv":1350.5,"fa":1303.9,"f":["LF","Ox"],"t":"Very Heavy Rocketry"},{"n":"Kerbodyne KR-2L+ \"Rhino\" Liquid Fuel Engine","m":9,"dry":9,"fuelM":0,"cost":25000,"sz":["3"],"gim":4.0,"iv":340,"ia":205,"fv":2000.7,"fa":1206.3,"f":["LF","Ox"],"t":"Very Heavy Rocketry"},{"n":"LFB KR-1x2 \"Twin-Boar\" Liquid Fuel Engine","m":42.5,"dry":10.5,"fuelM":32,"cost":17000,"sz":["2","R"],"gim":1.5,"iv":300,"ia":280,"fv":2000.7,"fa":1867.3,"f":["LF","Ox"],"t":"Heavier Rocketry"},{"n":"LV-1 \"Ant\" Liquid Fuel Engine","m":0.02,"dry":0.02,"fuelM":0,"cost":110,"sz":["0","R"],"gim":0.0,"iv":315,"ia":80,"fv":2,"fa":0.5,"f":["LF","Ox"],"t":"Propulsion Systems"},{"n":"LV-1R \"Spider\" Liquid Fuel Engine","m":0.02,"dry":0.02,"fuelM":0,"cost":120,"sz":["R"],"gim":10.0,"iv":290,"ia":260,"fv":2,"fa":1.8,"f":["LF","Ox"],"t":"Precision Propulsion"},{"n":"LV-909 \"Terrier\" Liquid Fuel Engine","m":0.5,"dry":0.5,"fuelM":0,"cost":390,"sz":["1"],"gim":4.0,"iv":345,"ia":85,"fv":60,"fa":14.8,"f":["LF","Ox"],"t":"Advanced Rocketry"},{"n":"LV-N \"Nerv\" Atomic Rocket Motor","m":3,"dry":3,"fuelM":0,"cost":10000,"sz":["1"],"gim":0.0,"iv":800,"ia":185,"fv":60,"fa":13.9,"f":["LF"],"t":"Nuclear Propulsion"},{"n":"LV-T30 \"Reliant\" Liquid Fuel Engine","m":1.25,"dry":1.25,"fuelM":0,"cost":1100,"sz":["1"],"gim":0.0,"iv":310,"ia":265,"fv":240.1,"fa":205.2,"f":["LF","Ox"],"t":"General Rocketry"},{"n":"LV-T45 \"Swivel\" Liquid Fuel Engine","m":1.5,"dry":1.5,"fuelM":0,"cost":1200,"sz":["1"],"gim":3.0,"iv":320,"ia":250,"fv":215.1,"fa":168,"f":["LF","Ox"],"t":"Basic Rocketry"},{"mh":1,"n":"LV-T91 \"Cheetah\"","m":1,"dry":1,"fuelM":0,"cost":1000,"sz":["1.5"],"gim":3,"iv":345,"ia":150,"fv":125,"fa":54.4,"f":["LF","Ox"],"t":"Heavier Rocketry"},{"mh":1,"n":"LV-TX87 \"Bobcat\"","m":2,"dry":2,"fuelM":0,"cost":2000,"sz":["1.5"],"gim":5,"iv":310,"ia":290,"fv":400.1,"fa":374.3,"f":["LF","Ox"],"t":"Heavy Rocketry"},{"n":"Mk-55 \"Thud\" Liquid Fuel Engine","m":0.9,"dry":0.9,"fuelM":0,"cost":820,"sz":["R"],"gim":8.0,"iv":305,"ia":275,"fv":120,"fa":108.2,"f":["LF","Ox"],"t":"Advanced Rocketry"},{"n":"O-10 \"Puff\" MonoPropellant Fuel Engine","m":0.09,"dry":0.09,"fuelM":0,"cost":150,"sz":["R"],"gim":6.0,"iv":250,"ia":120,"fv":20,"fa":9.6,"f":["Mono"],"t":"Precision Propulsion"},{"mh":1,"n":"RE-I2 \"Skiff\"","m":1,"dry":1,"fuelM":0,"cost":1500,"sz":["2"],"gim":2,"iv":330,"ia":265,"fv":300.1,"fa":241,"f":["LF","Ox"],"t":"Heavier Rocketry"},{"n":"RE-I5 \"Skipper\" Liquid Fuel Engine","m":3,"dry":3,"fuelM":0,"cost":5300,"sz":["2"],"gim":2.0,"iv":320,"ia":280,"fv":650.2,"fa":568.9,"f":["LF","Ox"],"t":"Heavy Rocketry"},{"mh":1,"n":"RE-J10 \"Wolfhound\"","m":2.5,"dry":2.5,"fuelM":0,"cost":1680,"sz":["2"],"gim":3,"iv":412,"ia":70,"fv":375.1,"fa":63.7,"f":["LF","Ox"],"t":"Very Heavy Rocketry"},{"n":"RE-L10 \"Poodle\" Liquid Fuel Engine","m":1.75,"dry":1.75,"fuelM":0,"cost":1300,"sz":["2"],"gim":4.5,"iv":350,"ia":90,"fv":250.1,"fa":64.3,"f":["LF","Ox"],"t":"Heavy Rocketry"},{"n":"RE-M3 \"Mainsail\" Liquid Fuel Engine","m":6,"dry":6,"fuelM":0,"cost":13000,"sz":["2"],"gim":2.0,"iv":310,"ia":285,"fv":1500.5,"fa":1379.5,"f":["LF","Ox"],"t":"Heavier Rocketry"},{"mh":1,"n":"RK-7 \"Kodiak\"","m":1.25,"dry":1.25,"fuelM":0,"cost":1300,"sz":["1.5"],"gim":0,"iv":305,"ia":265,"fv":240.1,"fa":208.6,"f":["LF","Ox"],"t":"Heavier Rocketry"},{"n":"RT-10 \"Hammer\" Solid Fuel Booster","m":3.563,"dry":0.75,"fuelM":2.813,"cost":400,"sz":["1","R"],"gim":0.0,"iv":195,"ia":170,"fv":227.1,"fa":198,"f":["SF"],"t":"Basic Rocketry"},{"n":"RT-5 \"Flea\" Solid Fuel Booster","m":1.5,"dry":0.45,"fuelM":1.05,"cost":200,"sz":["1","R"],"gim":0.0,"iv":165,"ia":140,"fv":192.1,"fa":163,"f":["SF"],"t":"Start"},{"mh":1,"n":"RV-1 \"Cub\"","m":0.18,"dry":0.18,"fuelM":0,"cost":1000,"sz":["R"],"gim":22.5,"iv":320,"ia":270,"fv":40,"fa":33.8,"f":["LF","Ox"],"t":"Precision Propulsion"},{"n":"S1 SRB-KD25k \"Kickback\" Solid Fuel Booster","m":24,"dry":4.5,"fuelM":19.5,"cost":2700,"sz":["1","R"],"gim":0.0,"iv":220,"ia":195,"fv":670.2,"fa":594.1,"f":["SF"],"t":"Heavy Rocketry"},{"n":"S2-17 \"Thoroughbred\" Solid Fuel Booster","m":70,"dry":10,"fuelM":60,"cost":9000,"sz":["2","R"],"gim":2.0,"iv":230,"ia":205,"fv":1700.6,"fa":1515.7,"f":["SF"],"t":"Heavier Rocketry"},{"n":"S2-33 \"Clydesdale\" Solid Fuel Booster","m":144,"dry":21,"fuelM":123,"cost":18500,"sz":["2","R"],"gim":1.0,"iv":235,"ia":210,"fv":3301.1,"fa":2949.9,"f":["SF"],"t":"Very Heavy Rocketry"},{"n":"S3 KS-25 \"Vector\" Liquid Fuel Engine","m":4,"dry":4,"fuelM":0,"cost":18000,"sz":["1","R"],"gim":10.5,"iv":315,"ia":295,"fv":1000.3,"fa":936.8,"f":["LF","Ox"],"t":"Very Heavy Rocketry"},{"n":"S3 KS-25x4 \"Mammoth\" Liquid Fuel Engine","m":15,"dry":15,"fuelM":0,"cost":39000,"sz":["3"],"gim":2.0,"iv":315,"ia":295,"fv":4001.4,"fa":3747.3,"f":["LF","Ox"],"t":"Very Heavy Rocketry"},{"n":"Sepratron I","m":0.072,"dry":0.012,"fuelM":0.06,"cost":75,"sz":["R"],"gim":0.0,"iv":154,"ia":118,"fv":18,"fa":13.8,"f":["SF"],"t":"Precision Propulsion"},{"n":"T-1 Toroidal Aerospike \"Dart\" Liquid Fuel Engine","m":1,"dry":1,"fuelM":0,"cost":3850,"sz":["1","R"],"gim":0.0,"iv":340,"ia":290,"fv":180.1,"fa":153.6,"f":["LF","Ox"],"t":"Hypersonic Flight"},{"n":"THK \"Pollux\"","m":51.5,"dry":8,"fuelM":43.5,"cost":6000,"sz":["1.5","R"],"gim":0,"iv":225,"ia":200,"fv":1300.4,"fa":1156,"f":["SF"],"t":"Heavy Rocketry","mh":1},{"rs":1,"n":"Mk-1H 'Torch' Liquid Fuel Engine","m":0.29,"dry":0.29,"fuelM":0,"cost":280.0,"sz":["0","R"],"gim":1.0,"iv":295,"ia":275,"fv":55.0,"fa":51.3,"f":["LF","Ox"],"t":"Propulsion Systems","slug":"restock-engine-torch"},{"rs":1,"n":"LV-303 'Pug' Liquid Fuel Engine","m":0.2,"dry":0.2,"fuelM":0,"cost":300.0,"sz":["1"],"gim":0.0,"iv":330,"ia":150,"fv":25.0,"fa":11.4,"f":["LF","Ox"],"t":"Basic Rocketry","slug":"restock-engine-125-pug"},{"rs":1,"n":"LV-T15 'Valiant' Liquid Fuel Engine","m":0.75,"dry":0.75,"fuelM":0,"cost":500.0,"sz":["1"],"gim":5.0,"iv":270,"ia":240,"fv":100.0,"fa":88.9,"f":["LF","Ox"],"t":"Basic Rocketry","slug":"restock-engine-125-valiant"},{"rs":1,"n":"UR-2 'Caravel' Liquid Fuel Engine","m":2.0,"dry":2.0,"fuelM":0,"cost":2300.0,"sz":["1","1.5","R"],"gim":2.0,"iv":320,"ia":265,"fv":510.0,"fa":422.3,"f":["LF","Ox"],"t":"Heavier Rocketry","slug":"restock-engine-caravel-1"},{"rs":1,"n":"UR-1 'Galleon' Liquid Fuel Engine","m":5.0,"dry":5.0,"fuelM":0,"cost":8000.0,"sz":["1","1.5","2","R"],"gim":5.0,"iv":305,"ia":290,"fv":1350.0,"fa":1283.6,"f":["LF","Ox"],"t":"Very Heavy Rocketry","slug":"restock-engine-galleon-1"},{"rs":1,"n":"UR-137 'Schnauzer' Liquid Fuel Engine","m":0.8,"dry":0.8,"fuelM":0,"cost":3000.0,"sz":["2","1.5","1","R"],"gim":3.0,"iv":350,"ia":70,"fv":110.0,"fa":22.0,"f":["LF","Ox"],"t":"Very Heavy Rocketry","slug":"restock-engine-schnauzer-1"},{"rs":1,"n":"RK-107 'Ursa' Liquid Fuel Engine","m":1.25,"dry":1.25,"fuelM":0,"cost":1100.0,"sz":["1","1.5","R"],"gim":0.0,"iv":300,"ia":285,"fv":260.0,"fa":247.0,"f":["LF","Ox"],"t":"Heavier Rocketry","slug":"restock-engine-ursa-1"},{"rs":1,"n":"KR-1 'Boar' Liquid Fuel Engine","m":3.5,"dry":3.5,"fuelM":0,"cost":7000.0,"sz":["2","1","R"],"gim":3.0,"iv":300,"ia":280,"fv":1000.0,"fa":933.3,"f":["LF","Ox"],"t":"Very Heavy Rocketry","slug":"restock-engine-boar"},{"rs":1,"n":"LV-N410 'Cherenkov' Atomic Rocket Motor","m":12.0,"dry":12.0,"fuelM":0,"cost":40000.0,"sz":["2","R"],"gim":5.0,"iv":820,"ia":200,"fv":300.0,"fa":73.2,"f":["LF"],"t":"Nuclear Propulsion","slug":"restock-engine-cherenkov"},{"rs":1,"n":"KR-10A 'Corgi' Liquid Fuel Engine Cluster","m":5.25,"dry":5.25,"fuelM":0,"cost":4250.0,"sz":["3","2"],"gim":4.0,"iv":355,"ia":95,"fv":750.0,"fa":200.7,"f":["LF","Ox"],"t":"Very Heavy Rocketry","slug":"restock-engine-375-corgi"},{"rs":1,"n":"RK-1 'Trash Panda' Vernier Engine","m":0.18,"dry":0.18,"fuelM":0,"cost":800.0,"sz":["R"],"gim":22.5,"iv":300,"ia":285,"fv":32.0,"fa":30.4,"f":["LF","Ox"],"t":"Precision Propulsion","slug":"restock-engine-panda-1","gim1":1},{"rs":1,"n":"Launch Escape System Jr.","m":0.6875,"dry":0.5,"fuelM":0.1875,"cost":400.0,"sz":["0"],"gim":0.0,"iv":180,"ia":160,"fv":200.0,"fa":177.8,"f":["SF"],"t":"Landing","slug":"restock-engine-les-2"},{"rs":1,"n":"TCK-2 'Castor' Solid Rocket Booster","m":51.5,"dry":8.0,"fuelM":43.5,"cost":6000.0,"sz":["1.5","R"],"gim":3.0,"iv":225,"ia":200,"fv":1300.0,"fa":1155.6,"f":["SF"],"t":"Heavier Rocketry","slug":"restock-srb-castor-1"},{"rs":1,"n":"FL-S1200 Liquid Fuel Tank","m":0.75,"dry":0.72,"fuelM":0.03,"cost":1400.0,"sz":["1.5","R"],"gim":0.0,"iv":154,"ia":118,"fv":32.0,"fa":24.5,"f":["SF"],"t":"Fuel Systems","slug":"restock-fueltank-1875-soyuz-1"}],"tanks":[{"n":"2.5m to Mk2 Adapter","wet":4.57,"dry":0.57,"sz":["2","Mk2"],"lf":360,"ox":440,"mono":0,"xe":0,"t":"High Altitude Flight","prop":4.0,"k":0.1425,"cost":800.0},{"n":"C7 Brand Adapter - 2.5m to 1.25m","wet":4.57,"dry":0.57,"sz":["1","2"],"lf":360,"ox":440,"mono":0,"xe":0,"t":"Advanced Fuel Systems","prop":4.0,"k":0.1425,"cost":800.0},{"mh":1,"n":"FL-A150 Fuel Tank Adapter","wet":0.9,"dry":0.1,"sz":["0","1.5"],"lf":72,"ox":88,"mono":0,"xe":0,"t":null,"prop":0.8,"k":0.125},{"mh":1,"n":"FL-A151L Fuel Tank Adapter","wet":3.375,"dry":0.375,"sz":["1","1.5"],"lf":270,"ox":330,"mono":0,"xe":0,"t":null,"prop":3.0,"k":0.125},{"mh":1,"n":"FL-A151S Fuel Tank Adapter","wet":0.9,"dry":0.1,"sz":["1","1.5"],"lf":72,"ox":88,"mono":0,"xe":0,"t":null,"prop":0.8,"k":0.125},{"mh":1,"n":"FL-A215 Fuel Tank Adapter","wet":6.75,"dry":0.75,"sz":["1.5","2"],"lf":540,"ox":660,"mono":0,"xe":0,"t":null,"prop":6.0,"k":0.125},{"mh":1,"n":"FL-C1000 Fuel Tank","wet":6.78,"dry":0.78,"sz":["1.5"],"lf":540,"ox":660,"mono":0,"xe":0,"t":null,"prop":6.0,"k":0.13},{"n":"FL-R750 RCS Fuel Tank","wet":3.4,"dry":0.4,"sz":["2"],"lf":0,"ox":0,"mono":750,"xe":0,"t":"Advanced Fuel Systems","prop":3.0,"k":0.13333,"cost":1800.0},{"n":"FL-R20 RCS Fuel Tank","wet":0.1,"dry":0.02,"sz":["0"],"lf":0,"ox":0,"mono":20,"xe":0,"t":"Advanced Fuel Systems","prop":0.08,"k":0.25,"cost":200.0},{"n":"FL-R120 RCS Fuel Tank","wet":0.56,"dry":0.08,"sz":["1"],"lf":0,"ox":0,"mono":120,"xe":0,"t":"Advanced Fuel Systems","prop":0.48,"k":0.16667,"cost":330.0},{"mh":1,"n":"FL-R5 RCS Fuel Tank","wet":1.85,"dry":0.25,"sz":["1.5"],"lf":0,"ox":0,"mono":400,"xe":0,"t":null,"prop":1.6,"k":0.15625},{"n":"FL-T100 Fuel Tank","wet":0.5625,"dry":0.0625,"sz":["1","R"],"lf":45,"ox":55,"mono":0,"xe":0,"t":"Basic Rocketry","prop":0.5,"k":0.125,"cost":150.0},{"n":"FL-T200 Fuel Tank","wet":1.125,"dry":0.125,"sz":["1","R"],"lf":90,"ox":110,"mono":0,"xe":0,"t":"General Rocketry","prop":1.0,"k":0.125,"cost":275.0},{"n":"FL-T400 Fuel Tank","wet":2.25,"dry":0.25,"sz":["1","R"],"lf":180,"ox":220,"mono":0,"xe":0,"t":"Advanced Rocketry","prop":2.0,"k":0.125,"cost":500.0},{"n":"FL-T800 Fuel Tank","wet":4.5,"dry":0.5,"sz":["1","R"],"lf":360,"ox":440,"mono":0,"xe":0,"t":"Fuel Systems","prop":4.0,"k":0.125,"cost":800.0},{"mh":1,"n":"FL-TX1800 Fuel Tank","wet":10.125,"dry":1.125,"sz":["1.5"],"lf":810,"ox":990,"mono":0,"xe":0,"t":null,"prop":9.0,"k":0.125},{"mh":1,"n":"FL-TX220 Fuel Tank","wet":1.2375,"dry":0.1375,"sz":["1.5"],"lf":99,"ox":121,"mono":0,"xe":0,"t":null,"prop":1.1,"k":0.125},{"mh":1,"n":"FL-TX440 Fuel Tank","wet":2.475,"dry":0.275,"sz":["1.5"],"lf":198,"ox":242,"mono":0,"xe":0,"t":null,"prop":2.2,"k":0.125},{"mh":1,"n":"FL-TX900 Fuel Tank","wet":5.0625,"dry":0.5625,"sz":["1.5"],"lf":405,"ox":495,"mono":0,"xe":0,"t":null,"prop":4.5,"k":0.125},{"n":"Kerbodyne ADTP-2-3","wet":16.875,"dry":1.875,"sz":["2","3"],"lf":1350,"ox":1650,"mono":0,"xe":0,"t":"Large Volume Containment","prop":15.0,"k":0.125,"cost":1623.0},{"n":"kerbodyne Engine Cluster Adapter Tank","wet":50.625,"dry":5.625,"sz":["4","1"],"lf":4050,"ox":4950,"mono":0,"xe":0,"t":null,"prop":45.0,"k":0.125,"mh":1},{"n":"Kerbodyne S3-14400 Tank","wet":81,"dry":9,"sz":["3"],"lf":6480,"ox":7920,"mono":0,"xe":0,"t":"High-Performance Fuel Systems","prop":72.0,"k":0.125,"cost":13000.0},{"n":"Kerbodyne S3-3600 Tank","wet":20.25,"dry":2.25,"sz":["3"],"lf":1620,"ox":1980,"mono":0,"xe":0,"t":"Large Volume Containment","prop":18.0,"k":0.125,"cost":3250.0},{"n":"Kerbodyne S3-7200 Tank","wet":40.5,"dry":4.5,"sz":["3"],"lf":3240,"ox":3960,"mono":0,"xe":0,"t":"Large Volume Containment","prop":36.0,"k":0.125,"cost":6500.0},{"n":"Kerbodyne S3-S4 Adapter Tank","wet":36,"dry":4,"sz":["3","4"],"lf":2880,"ox":3520,"mono":0,"xe":0,"t":null,"prop":32.0,"k":0.125,"mh":1},{"n":"Kerbodyne S4-128 Fuel Tank","wet":72,"dry":8,"sz":["4"],"lf":5760,"ox":7040,"mono":0,"xe":0,"t":null,"prop":64.0,"k":0.125,"mh":1},{"n":"Kerbodyne S4-256 Fuel Tank","wet":144,"dry":16,"sz":["4"],"lf":11520,"ox":14080,"mono":0,"xe":0,"t":null,"prop":128.0,"k":0.125,"mh":1},{"n":"Kerbodyne S4-512 Fuel Tank","wet":288,"dry":32,"sz":["4"],"lf":23040,"ox":28160,"mono":0,"xe":0,"t":null,"prop":256.0,"k":0.125,"mh":1},{"n":"Kerbodyne S4-64 Fuel Tank","wet":36,"dry":4,"sz":["4"],"lf":2880,"ox":3520,"mono":0,"xe":0,"t":null,"prop":32.0,"k":0.125,"mh":1},{"n":"Mk0 Liquid Fuel Fuselage","wet":0.275,"dry":0.025,"sz":["0"],"lf":50,"ox":0,"mono":0,"xe":0,"t":"Aviation","prop":0.25,"k":0.1,"cost":200.0},{"n":"Mk1 Liquid Fuel Fuselage","wet":2.25,"dry":0.25,"sz":["1"],"lf":400,"ox":0,"mono":0,"xe":0,"t":"Aviation","prop":2.0,"k":0.125,"cost":550.0},{"n":"Mk2 Bicoupler","wet":2.29,"dry":0.29,"sz":["1","Mk2"],"lf":180,"ox":220,"mono":0,"xe":0,"t":"Supersonic Flight","prop":2.0,"k":0.145,"cost":860.0},{"n":"Mk2 Liquid Fuel Fuselage","wet":4.57,"dry":0.57,"sz":["Mk2"],"lf":800,"ox":0,"mono":0,"xe":0,"t":"High Altitude Flight","prop":4.0,"k":0.1425,"cost":1450.0},{"n":"Mk2 Liquid Fuel Fuselage Short","wet":2.29,"dry":0.29,"sz":["Mk2"],"lf":400,"ox":0,"mono":0,"xe":0,"t":"Supersonic Flight","prop":2.0,"k":0.145,"cost":750.0},{"n":"Mk2 Monopropellant Tank","wet":1.89,"dry":0.29,"sz":["Mk2"],"lf":0,"ox":0,"mono":400,"xe":0,"t":"High Altitude Flight","prop":1.6,"k":0.18125,"cost":750.0},{"n":"Mk2 Rocket Fuel Fuselage","wet":4.57,"dry":0.57,"sz":["Mk2"],"lf":360,"ox":440,"mono":0,"xe":0,"t":"High Altitude Flight","prop":4.0,"k":0.1425,"cost":1450.0},{"n":"Mk2 Rocket Fuel Fuselage Short","wet":2.29,"dry":0.29,"sz":["Mk2"],"lf":180,"ox":220,"mono":0,"xe":0,"t":"Supersonic Flight","prop":2.0,"k":0.145,"cost":750.0},{"n":"Mk2 to 1.25m Adapter","wet":2.29,"dry":0.29,"sz":["Mk2","1"],"lf":180,"ox":220,"mono":0,"xe":0,"t":"Supersonic Flight","prop":2.0,"k":0.145,"cost":550.0},{"n":"Mk2 to 1.25m Adapter Long","wet":4.57,"dry":0.57,"sz":["Mk2","1"],"lf":360,"ox":440,"mono":0,"xe":0,"t":"High Altitude Flight","prop":4.0,"k":0.1425,"cost":1050.0},{"n":"Mk3 Liquid Fuel Fuselage","wet":28.57,"dry":3.57,"sz":["Mk3"],"lf":5000,"ox":0,"mono":0,"xe":0,"t":"Heavy Aerodynamics","prop":25.0,"k":0.1428,"cost":8600.0},{"n":"Mk3 Liquid Fuel Fuselage Long","wet":57.14,"dry":7.14,"sz":["Mk3"],"lf":10000,"ox":0,"mono":0,"xe":0,"t":"Experimental Aerodynamics","prop":50.0,"k":0.1428,"cost":17200.0},{"n":"Mk3 Liquid Fuel Fuselage Short","wet":14.29,"dry":1.79,"sz":["Mk3"],"lf":2500,"ox":0,"mono":0,"xe":0,"t":"Heavy Aerodynamics","prop":12.5,"k":0.1432,"cost":4300.0},{"n":"Mk3 Monopropellant Tank","wet":9.8,"dry":1.4,"sz":["Mk3"],"lf":0,"ox":0,"mono":2100,"xe":0,"t":"Experimental Aerodynamics","prop":8.4,"k":0.16667,"cost":5040.0},{"n":"Mk3 Rocket Fuel Fuselage","wet":28.57,"dry":3.57,"sz":["Mk3"],"lf":2250,"ox":2750,"mono":0,"xe":0,"t":"Experimental Aerodynamics","prop":25.0,"k":0.1428,"cost":5000.0},{"n":"Mk3 Rocket Fuel Fuselage Long","wet":57.14,"dry":7.14,"sz":["Mk3"],"lf":4500,"ox":5500,"mono":0,"xe":0,"t":"Experimental Aerodynamics","prop":50.0,"k":0.1428,"cost":10000.0},{"n":"Mk3 Rocket Fuel Fuselage Short","wet":14.29,"dry":1.79,"sz":["Mk3"],"lf":1125,"ox":1375,"mono":0,"xe":0,"t":"Experimental Aerodynamics","prop":12.5,"k":0.1432,"cost":2500.0},{"n":"Mk3 to 2.5m Adapter","wet":14.29,"dry":1.79,"sz":["Mk3","2"],"lf":1125,"ox":1375,"mono":0,"xe":0,"t":"Heavy Aerodynamics","prop":12.5,"k":0.1432,"cost":2500.0},{"n":"Mk3 to 3.75m Adapter","wet":14.29,"dry":1.79,"sz":["Mk3","3"],"lf":1125,"ox":1375,"mono":0,"xe":0,"t":"Experimental Aerodynamics","prop":12.5,"k":0.1432,"cost":2500.0},{"n":"Mk3 to Mk2 Adapter","wet":11.43,"dry":1.43,"sz":["Mk3","Mk2"],"lf":900,"ox":1100,"mono":0,"xe":0,"t":"Experimental Aerodynamics","prop":10.0,"k":0.143,"cost":2200.0},{"n":"NCS Adapter","wet":0.5,"dry":0.1,"sz":["0","1"],"lf":80,"ox":0,"mono":0,"xe":0,"t":"Aerodynamics","prop":0.4,"k":0.25,"cost":320.0},{"n":"Oscar-B Fuel Tank","wet":0.225,"dry":0.025,"sz":["0"],"lf":18,"ox":22,"mono":0,"xe":0,"t":"Propulsion Systems","prop":0.2,"k":0.125,"cost":70.0},{"n":"PB-X150 Xenon Container","wet":0.096,"dry":0.024,"sz":["0"],"lf":0,"ox":0,"mono":0,"xe":720,"t":"Ion Propulsion","prop":0.072,"k":0.33333,"cost":3680.0},{"n":"PB-X50R Xenon Container","wet":0.054,"dry":0.0135,"sz":["R"],"lf":0,"ox":0,"mono":0,"xe":405,"t":"Ion Propulsion","prop":0.0405,"k":0.33333,"cost":2220.0},{"n":"PB-X750 Xenon Container","wet":0.76,"dry":0.19,"sz":["1"],"lf":0,"ox":0,"mono":0,"xe":5700,"t":"Ion Propulsion","prop":0.57,"k":0.33333,"cost":24300.0},{"n":"R-11 'Baguette' External Tank","wet":0.3038,"dry":0.0338,"sz":["R"],"lf":24.3,"ox":29.7,"mono":0,"xe":0,"t":"Propulsion Systems","prop":0.27,"k":0.12519,"cost":50.0},{"n":"R-12 'Doughnut' External Tank","wet":0.3375,"dry":0.0375,"sz":["1"],"lf":27,"ox":33,"mono":0,"xe":0,"t":"Precision Propulsion","prop":0.3,"k":0.125,"cost":147.0},{"n":"R-4 'Dumpling' External Tank","wet":0.1238,"dry":0.0138,"sz":["R"],"lf":9.9,"ox":12.1,"mono":0,"xe":0,"t":"Precision Propulsion","prop":0.11,"k":0.12545,"cost":50.0},{"n":"Rockomax Jumbo-64 Fuel Tank","wet":36,"dry":4,"sz":["2"],"lf":2880,"ox":3520,"mono":0,"xe":0,"t":"Advanced Fuel Systems","prop":32.0,"k":0.125,"cost":5750.0},{"n":"Rockomax X200-16 Fuel Tank","wet":9,"dry":1,"sz":["2"],"lf":720,"ox":880,"mono":0,"xe":0,"t":"Fuel Systems","prop":8.0,"k":0.125,"cost":1550.0},{"n":"Rockomax X200-32 Fuel Tank","wet":18,"dry":2,"sz":["2"],"lf":1440,"ox":1760,"mono":0,"xe":0,"t":"Fuel Systems","prop":16.0,"k":0.125,"cost":3000.0},{"n":"Rockomax X200-8 Fuel Tank","wet":4.5,"dry":0.5,"sz":["2"],"lf":360,"ox":440,"mono":0,"xe":0,"t":"Fuel Systems","prop":4.0,"k":0.125,"cost":800.0},{"n":"Stratus-V Cylindrified Monopropellant Tank","wet":0.23,"dry":0.03,"sz":["R"],"lf":0,"ox":0,"mono":50,"xe":0,"t":"Specialized Control","prop":0.2,"k":0.15,"cost":250.0},{"n":"Stratus-V Minified Monopropellant Tank","wet":0.04,"dry":0.01,"sz":["R"],"lf":0,"ox":0,"mono":7.5,"xe":0,"t":null,"prop":0.03,"k":0.33333,"mh":1},{"n":"Stratus-V Roundified Monopropellant Tank","wet":0.1,"dry":0.02,"sz":["R"],"lf":0,"ox":0,"mono":20,"xe":0,"t":"Advanced Flight Control","prop":0.08,"k":0.25,"cost":200.0},{"rs":1,"n":"Oscar-O Hemispherical Liquid Fuel Tank","wet":0.0562,"dry":0.0112,"sz":["0","R"],"lf":4.05,"ox":4.95,"mono":0,"xe":0,"cost":18.0,"t":"Propulsion Systems","prop":0.045,"k":0.25,"slug":"restock-fueltank-sphere-0625-1"},{"rs":1,"n":"Oscar-E Liquid Fuel Tank","wet":0.81,"dry":0.09,"sz":["0","R"],"lf":64.8,"ox":79.2,"mono":0,"xe":0,"cost":144.0,"t":"Precision Propulsion","prop":0.72,"k":0.125,"slug":"restock-fuel-tank-0625-1"},{"rs":1,"n":"Oscar-D Liquid Fuel Tank","wet":0.405,"dry":0.045,"sz":["0","R"],"lf":32.4,"ox":39.6,"mono":0,"xe":0,"cost":72.0,"t":"Precision Propulsion","prop":0.36,"k":0.125,"slug":"restock-fuel-tank-0625-2"},{"rs":1,"n":"Oscar-C Liquid Fuel Tank","wet":0.2025,"dry":0.0225,"sz":["0","R"],"lf":16.2,"ox":19.8,"mono":0,"xe":0,"cost":36.0,"t":"Propulsion Systems","prop":0.18,"k":0.125,"slug":"restock-fuel-tank-0625-3"},{"rs":1,"n":"Oscar-A Liquid Fuel Tank","wet":0.0506,"dry":0.0056,"sz":["0","R"],"lf":4.05,"ox":4.95,"mono":0,"xe":0,"cost":9.0,"t":"Propulsion Systems","prop":0.045,"k":0.125,"slug":"restock-fuel-tank-0625-5"},{"rs":1,"n":"PRBE-9 Liquid Fuel Tank","wet":0.0506,"dry":0.0056,"sz":["0","R"],"lf":4.05,"ox":4.95,"mono":0,"xe":0,"cost":9.0,"t":"Precision Propulsion","prop":0.045,"k":0.125,"slug":"restock-fuel-tank-probe-1"},{"rs":1,"n":"PRBE-4 Liquid Fuel Tank","wet":0.0253,"dry":0.0028,"sz":["0","R"],"lf":2.025,"ox":2.475,"mono":0,"xe":0,"cost":5.0,"t":"Precision Propulsion","prop":0.0225,"k":0.125,"slug":"restock-fuel-tank-probe-2"},{"rs":1,"n":"FL-T50-R Hemispherical Liquid Fuel Tank","wet":0.3125,"dry":0.0625,"sz":["1","R"],"lf":22.5,"ox":27.5,"mono":0,"xe":0,"cost":150.0,"t":"General Rocketry","prop":0.25,"k":0.25,"slug":"restock-fueltank-sphere-125-1"},{"rs":1,"n":"FL-TX220-R Hemispherical Liquid Fuel Tank","wet":1.2375,"dry":0.1375,"sz":["1.5","R"],"lf":99.0,"ox":121.0,"mono":0,"xe":0,"cost":220.0,"t":"Advanced Rocketry","prop":1.1,"k":0.125,"slug":"restock-fueltank-sphere-1875-1"},{"rs":1,"n":"FL-X1800 Liquid Fuel Tank","wet":10.125,"dry":1.125,"sz":["1.5","R"],"lf":810.0,"ox":990.0,"mono":0,"xe":0,"cost":1800.0,"t":"Advanced Fuel Systems","prop":9.0,"k":0.125,"slug":"restock-fueltank-1875-1"},{"rs":1,"n":"FL-X900 Liquid Fuel Tank","wet":5.0625,"dry":0.5625,"sz":["1.5","R"],"lf":405.0,"ox":495.0,"mono":0,"xe":0,"cost":900.0,"t":"Fuel Systems","prop":4.5,"k":0.125,"slug":"restock-fueltank-1875-2"},{"rs":1,"n":"FL-X440 Liquid Fuel Tank","wet":2.475,"dry":0.275,"sz":["1.5","R"],"lf":198.0,"ox":242.0,"mono":0,"xe":0,"cost":440.0,"t":"Fuel Systems","prop":2.2,"k":0.125,"slug":"restock-fueltank-1875-3"},{"rs":1,"n":"FL-X220 Liquid Fuel Tank","wet":1.2375,"dry":0.1375,"sz":["1.5","R"],"lf":99.0,"ox":121.0,"mono":0,"xe":0,"cost":220.0,"t":"Advanced Rocketry","prop":1.1,"k":0.125,"slug":"restock-fueltank-1875-4"},{"rs":1,"n":"FL-XA160-S Fuel Tank Adapter","wet":0.9,"dry":0.1,"sz":["0","1.5","R"],"lf":72.0,"ox":88.0,"mono":0,"xe":0,"cost":160.0,"t":"Fuel Systems","prop":0.8,"k":0.125,"slug":"restock-fueltank-adapter-1875-0625-1"},{"rs":1,"n":"FL-XA600 Fuel Tank Adapter","wet":3.375,"dry":0.375,"sz":["1.5","1","R"],"lf":270.0,"ox":330.0,"mono":0,"xe":0,"cost":600.0,"t":"Fuel Systems","prop":3.0,"k":0.125,"slug":"restock-fueltank-adapter-1875-125-1"},{"rs":1,"n":"FL-XA160 Fuel Tank Adapter","wet":0.9,"dry":0.1,"sz":["1","1.5","R"],"lf":72.0,"ox":88.0,"mono":0,"xe":0,"cost":160.0,"t":"Advanced Rocketry","prop":0.8,"k":0.125,"slug":"restock-fueltank-adapter-1875-125-2"},{"rs":1,"n":"FL-XA1200 Fuel Tank Adapter","wet":6.75,"dry":0.75,"sz":["1.5","2","R"],"lf":540.0,"ox":660.0,"mono":0,"xe":0,"cost":1200.0,"t":"Fuel Systems","prop":6.0,"k":0.125,"slug":"restock-fueltank-adapter-25-1875-1"},{"rs":1,"n":"Rockomax X-200-4R Hemispherical Liquid Fuel Tank","wet":2.5,"dry":0.5,"sz":["2","R"],"lf":180.0,"ox":220.0,"mono":0,"xe":0,"cost":800.0,"t":"Fuel Systems","prop":2.0,"k":0.25,"slug":"restock-fueltank-sphere-25-1"},{"rs":1,"n":"Kerbodyne S3-1800 Tank","wet":10.125,"dry":1.125,"sz":["3","R"],"lf":810.0,"ox":990.0,"mono":0,"xe":0,"cost":1625.0,"t":"High-Performance Fuel Systems","prop":9.0,"k":0.125,"slug":"restock-fuel-tank-375-4"},{"rs":1,"n":"Kerbodyne S3-900R Hemispherical Liquid Fuel Tank","wet":5.625,"dry":1.125,"sz":["3","R"],"lf":405.0,"ox":495.0,"mono":0,"xe":0,"cost":1625.0,"t":"High-Performance Fuel Systems","prop":4.5,"k":0.25,"slug":"restock-fueltank-sphere-375-1"},{"rs":1,"n":"Kerbodyne S3-3600 Nosecone","wet":20.25,"dry":2.25,"sz":["3","R"],"lf":1620.0,"ox":1980.0,"mono":0,"xe":0,"cost":3450.0,"t":"High-Performance Fuel Systems","prop":18.0,"k":0.125,"slug":"restock-nosecone-375-1"},{"rs":1,"n":"Kerbodyne SIV-512K Liquid Fuel Tank","wet":288.0,"dry":32.0,"sz":["4","R"],"lf":23040.0,"ox":28160.0,"mono":0,"xe":0,"cost":51200.0,"t":"High-Performance Fuel Systems","prop":256.0,"k":0.125,"slug":"restock-fueltank-5-1"},{"rs":1,"n":"Kerbodyne SIV-256K Liquid Fuel Tank","wet":144.0,"dry":16.0,"sz":["4","R"],"lf":11520.0,"ox":14080.0,"mono":0,"xe":0,"cost":25600.0,"t":"High-Performance Fuel Systems","prop":128.0,"k":0.125,"slug":"restock-fueltank-5-2"},{"rs":1,"n":"Kerbodyne SIV-128K Liquid Fuel Tank","wet":72.0,"dry":8.0,"sz":["4","R"],"lf":5760.0,"ox":7040.0,"mono":0,"xe":0,"cost":12800.0,"t":"High-Performance Fuel Systems","prop":64.0,"k":0.125,"slug":"restock-fueltank-5-3"},{"rs":1,"n":"Kerbodyne SIV-64K Liquid Fuel Tank","wet":36.0,"dry":4.0,"sz":["4","R"],"lf":2880.0,"ox":3520.0,"mono":0,"xe":0,"cost":6400.0,"t":"High-Performance Fuel Systems","prop":32.0,"k":0.125,"slug":"restock-fueltank-5-4"},{"rs":1,"n":"Kerbodyne SAIV Liquid Fuel Tank Adapter","wet":36.0,"dry":4.0,"sz":["3","4","R"],"lf":2880.0,"ox":3520.0,"mono":0,"xe":0,"cost":6400.0,"t":"High-Performance Fuel Systems","prop":32.0,"k":0.125,"slug":"restock-fueltank-adapter-375-5-1"},{"rs":1,"n":"Kerbodyne SIV Fuelled Engine Adapter","wet":50.625,"dry":5.625,"sz":["4","1","R"],"lf":4050.0,"ox":4950.0,"mono":0,"xe":0,"cost":8000.0,"t":"High-Performance Fuel Systems","prop":45.0,"k":0.125,"slug":"restock-fueltank-saturn-engine-1"}],"nodes":{"Start":{"lvl":1,"deps":[]},"Basic Rocketry":{"lvl":2,"deps":["Start"]},"Engineering 101":{"lvl":2,"deps":["Start"]},"General Rocketry":{"lvl":3,"deps":["Basic Rocketry"]},"Stability":{"lvl":3,"deps":["Engineering 101","Basic Rocketry"]},"Survivability":{"lvl":3,"deps":["Engineering 101"]},"Advanced Rocketry":{"lvl":4,"deps":["General Rocketry"]},"General Construction":{"lvl":4,"deps":["Stability","General Rocketry"]},"Aviation":{"lvl":4,"deps":["Stability"]},"Flight Control":{"lvl":4,"deps":["Survivability","Stability"]},"Basic Science":{"lvl":4,"deps":["Survivability"]},"Heavy Rocketry":{"lvl":5,"deps":["Advanced Rocketry"]},"Propulsion Systems":{"lvl":5,"deps":["Advanced Rocketry"]},"Fuel Systems":{"lvl":5,"deps":["Advanced Rocketry","General Construction"]},"Advanced Construction":{"lvl":5,"deps":["General Construction"]},"Aerodynamics":{"lvl":5,"deps":["Aviation","General Construction"]},"Landing":{"lvl":5,"deps":["Flight Control","Aviation"]},"Advanced Flight Control":{"lvl":5,"deps":["Flight Control"]},"Space Exploration":{"lvl":5,"deps":["Basic Science"]},"Miniaturization":{"lvl":5,"deps":["Basic Science"]},"Electrics":{"lvl":5,"deps":["Basic Science"]},"Heavier Rocketry":{"lvl":6,"deps":["Heavy Rocketry"]},"Precision Propulsion":{"lvl":6,"deps":["Propulsion Systems"]},"Advanced Fuel Systems":{"lvl":6,"deps":["Propulsion Systems","Fuel Systems"]},"Specialized Construction":{"lvl":6,"deps":["Advanced Construction"]},"Actuators":{"lvl":6,"deps":["Advanced Construction"]},"Supersonic Flight":{"lvl":6,"deps":["Aerodynamics"]},"Advanced Aerodynamics":{"lvl":6,"deps":["Aerodynamics"]},"Advanced Landing":{"lvl":6,"deps":["Landing"]},"Specialized Control":{"lvl":6,"deps":["Advanced Flight Control"]},"Command Modules":{"lvl":6,"deps":["Space Exploration","Advanced Flight Control"]},"Advanced Exploration":{"lvl":6,"deps":["Space Exploration"]},"Precision Engineering":{"lvl":6,"deps":["Miniaturization","Electrics"]},"Advanced Electrics":{"lvl":6,"deps":["Electrics"]},"Nuclear Propulsion":{"lvl":7,"deps":["Advanced Fuel Systems","Heavier Rocketry"]},"Large Volume Containment":{"lvl":7,"deps":["Advanced Fuel Systems","Specialized Construction"]},"Advanced MetalWorks":{"lvl":7,"deps":["Specialized Construction"]},"Composites":{"lvl":7,"deps":["Specialized Construction"]},"High Altitude Flight":{"lvl":7,"deps":["Supersonic Flight"]},"Heavy Aerodynamics":{"lvl":7,"deps":["Advanced Aerodynamics"]},"Heavy Landing":{"lvl":7,"deps":["Advanced Landing"]},"Field Science":{"lvl":7,"deps":["Advanced Landing","Advanced Exploration"]},"Scanning Tech":{"lvl":7,"deps":["Advanced Exploration","Precision Engineering"]},"Unmanned Tech":{"lvl":7,"deps":["Precision Engineering"]},"Electronics":{"lvl":7,"deps":["Precision Engineering","Advanced Electrics"]},"High-Power Electrics":{"lvl":7,"deps":["Advanced Electrics"]},"Very Heavy Rocketry":{"lvl":8,"deps":["Large Volume Containment","Heavier Rocketry"]},"High-Performance Fuel Systems":{"lvl":8,"deps":["Large Volume Containment"]},"Meta-Materials":{"lvl":8,"deps":["Composites"]},"Hypersonic Flight":{"lvl":8,"deps":["High Altitude Flight"]},"Experimental Aerodynamics":{"lvl":8,"deps":["Heavy Aerodynamics"]},"Advanced Motors":{"lvl":8,"deps":["Field Science"]},"Advanced Science Tech":{"lvl":8,"deps":["Scanning Tech","Field Science"]},"Ion Propulsion":{"lvl":8,"deps":["Scanning Tech","Unmanned Tech"]},"Advanced Unmanned Tech":{"lvl":8,"deps":["Unmanned Tech"]},"Automation":{"lvl":8,"deps":["Unmanned Tech","Electronics"]},"Specialized Electrics":{"lvl":8,"deps":["High-Power Electrics"]},"Nanolathing":{"lvl":8,"deps":["Advanced MetalWorks"]},"Aerospace Tech":{"lvl":9,"deps":["Hypersonic Flight"]},"Experimental Science":{"lvl":9,"deps":["Advanced Science Tech"]},"Large Probes":{"lvl":9,"deps":["Advanced Unmanned Tech","Automation"]},"Experimental Electrics":{"lvl":9,"deps":["Specialized Electrics"]},"Experimental Motors":{"lvl":9,"deps":["Advanced Motors"]}}};

const G0 = 9.81;

/* ------------------------------- design tokens ------------------------------- */
/* Single palette. Every colour in the app comes from here or is derived from a
   body hue, so the whole thing can be retoned by editing this block.
   Contrast is checked against WCAG: body text clears 4.5:1 on every surface it
   sits on, interactive borders and drawn shapes clear 3:1. */
const C = {
  // surfaces, darkest first
  ink: "#0A1017", panel: "#111A25", panel2: "#16212F",
  // lines: rule divides, edge outlines anything you can click or must see
  rule: "#2E4258", edge: "#52708F",
  // type
  paper: "#E6EDF6",   // 14.9:1 on panel
  muted: "#7E93AD",   //  5.6:1 on panel
  dim:   "#7389A6",   //  4.9:1 on panel — was #4E637C at 2.8:1, below the floor
  // accents
  amber: "#F5A623", mint: "#4FD1A5", rust: "#E2603F",
  moss: "#86B24A", violet: "#A177DB", sky: "#4A9BE0", ice: "#6FD7E8",
  // drawing fills, all clear of the panel behind them
  tank: "#5F7488", engine: "#9FB0C4", payloadFill: "#4FD1A5", shroud: "#3F5064",
  // labels printed on top of a filled body hue
  onLight: "#0B1119", onDark: "#F2EFE9",
};

/* ------------------------------- destinations -------------------------------
   Each destination is an ordered list of legs from the Kerbin launchpad, matching
   the community delta-v map. kind drives what each mission profile keeps.
   g = local surface gravity used for landing/ascent TWR checks.               */
const ASCENT = { label: "Launchpad → 80 km orbit", dv: 3400, kind: "ascent", body: "Kerbin", g: 9.81, atm: true };
const ESCAPE = { label: "LKO → Kerbin escape", dv: 950, kind: "transfer", body: "Kerbin", g: 9.81 };

const DEST = {
  "Low Kerbin Orbit": { color: C.sky, legs: [ASCENT] },
  "Keostationary orbit": { color: C.sky, legs: [ASCENT,
    { label: "LKO → keostationary transfer", dv: 1115, kind: "transfer", body: "Kerbin", g: 9.81 },
    { label: "Circularize at 2 868 km", dv: 1030, kind: "capture", body: "Kerbin", g: 9.81 }] },
  "Mun": { color: C.amber, g: 1.63, legs: [ASCENT,
    { label: "LKO → Mun intercept", dv: 860, kind: "transfer", body: "Mun", g: 1.63 },
    { label: "Capture → low Mun orbit", dv: 280, kind: "capture", body: "Mun", g: 1.63 },
    { label: "Descent to Mun surface", dv: 580, kind: "land", body: "Mun", g: 1.63 }] },
  "Minmus": { color: C.mint, g: 0.491, legs: [ASCENT,
    { label: "LKO → Minmus intercept", dv: 930, kind: "transfer", body: "Minmus", g: 0.491 },
    { label: "Capture → low Minmus orbit", dv: 160, kind: "capture", body: "Minmus", g: 0.491 },
    { label: "Descent to Minmus surface", dv: 180, kind: "land", body: "Minmus", g: 0.491 }] },
  "Duna": { color: C.rust, g: 2.94, atm: true, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Duna transfer", dv: 130, kind: "transfer", body: "Duna", g: 2.94 },
    { label: "Capture → low Duna orbit", dv: 250, kind: "capture", body: "Duna", g: 2.94 },
    { label: "Descent to Duna surface", dv: 1450, kind: "land", body: "Duna", g: 2.94, atm: true }] },
  "Ike": { color: C.rust, g: 1.1, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Duna transfer", dv: 130, kind: "transfer", body: "Duna", g: 2.94 },
    { label: "Duna capture", dv: 250, kind: "capture", body: "Duna", g: 2.94 },
    { label: "Duna orbit → Ike intercept", dv: 30, kind: "transfer", body: "Ike", g: 1.1 },
    { label: "Capture → low Ike orbit", dv: 180, kind: "capture", body: "Ike", g: 1.1 },
    { label: "Descent to Ike surface", dv: 390, kind: "land", body: "Ike", g: 1.1 }] },
  "Eve": { color: C.violet, g: 16.7, atm: true, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Eve transfer", dv: 90, kind: "transfer", body: "Eve", g: 16.7 },
    { label: "Capture → low Eve orbit", dv: 1330, kind: "capture", body: "Eve", g: 16.7 },
    { label: "Eve surface ↔ low orbit", dv: 8000, kind: "land", body: "Eve", g: 16.7, atm: true }] },
  "Gilly": { color: C.violet, g: 0.049, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Eve transfer", dv: 90, kind: "transfer", body: "Eve", g: 16.7 },
    { label: "Eve capture", dv: 80, kind: "capture", body: "Eve", g: 16.7 },
    { label: "Eve orbit → Gilly intercept", dv: 60, kind: "transfer", body: "Gilly", g: 0.049 },
    { label: "Capture → low Gilly orbit", dv: 410, kind: "capture", body: "Gilly", g: 0.049 },
    { label: "Descent to Gilly surface", dv: 30, kind: "land", body: "Gilly", g: 0.049 }] },
  "Moho": { color: "#E85D75", g: 2.7, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Moho transfer", dv: 760, kind: "transfer", body: "Moho", g: 2.7 },
    { label: "Capture → low Moho orbit", dv: 2410, kind: "capture", body: "Moho", g: 2.7 },
    { label: "Descent to Moho surface", dv: 870, kind: "land", body: "Moho", g: 2.7 }] },
  "Dres": { color: "#B9A06B", g: 1.13, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Dres transfer", dv: 610, kind: "transfer", body: "Dres", g: 1.13 },
    { label: "Capture → low Dres orbit", dv: 1290, kind: "capture", body: "Dres", g: 1.13 },
    { label: "Descent to Dres surface", dv: 430, kind: "land", body: "Dres", g: 1.13 }] },
  "Jool orbit": { color: C.moss, g: 7.85, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Jool transfer", dv: 980, kind: "transfer", body: "Jool", g: 7.85 },
    { label: "Capture into Jool orbit", dv: 160, kind: "capture", body: "Jool", g: 7.85 }] },
  "Laythe": { color: C.moss, g: 7.85, atm: true, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Jool transfer", dv: 980, kind: "transfer", body: "Jool", g: 7.85 },
    { label: "Jool capture", dv: 160, kind: "capture", body: "Jool", g: 7.85 },
    { label: "Jool orbit → Laythe intercept", dv: 930, kind: "transfer", body: "Laythe", g: 7.85 },
    { label: "Descent to Laythe surface", dv: 2900, kind: "land", body: "Laythe", g: 7.85, atm: true }] },
  "Tylo": { color: C.moss, g: 7.85, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Jool transfer", dv: 980, kind: "transfer", body: "Jool", g: 7.85 },
    { label: "Jool capture", dv: 160, kind: "capture", body: "Jool", g: 7.85 },
    { label: "Jool orbit → Tylo intercept", dv: 400, kind: "transfer", body: "Tylo", g: 7.85 },
    { label: "Descent to Tylo surface", dv: 2270, kind: "land", body: "Tylo", g: 7.85 }] },
  "Vall": { color: C.moss, g: 2.31, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Jool transfer", dv: 980, kind: "transfer", body: "Jool", g: 7.85 },
    { label: "Jool capture", dv: 160, kind: "capture", body: "Jool", g: 7.85 },
    { label: "Jool orbit → Vall intercept", dv: 620, kind: "transfer", body: "Vall", g: 2.31 },
    { label: "Descent to Vall surface", dv: 860, kind: "land", body: "Vall", g: 2.31 }] },
  "Pol": { color: C.moss, g: 0.373, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Jool transfer", dv: 980, kind: "transfer", body: "Jool", g: 7.85 },
    { label: "Jool capture", dv: 160, kind: "capture", body: "Jool", g: 7.85 },
    { label: "Jool orbit → Pol intercept", dv: 160, kind: "transfer", body: "Pol", g: 0.373 },
    { label: "Descent to Pol surface", dv: 130, kind: "land", body: "Pol", g: 0.373 }] },
  "Eeloo": { color: C.ice, g: 1.69, legs: [ASCENT, ESCAPE,
    { label: "Kerbin escape → Eeloo transfer", dv: 1140, kind: "transfer", body: "Eeloo", g: 1.69 },
    { label: "Capture → low Eeloo orbit", dv: 1370, kind: "capture", body: "Eeloo", g: 1.69 },
    { label: "Descent to Eeloo surface", dv: 620, kind: "land", body: "Eeloo", g: 1.69 }] },
};

const PROFILES = {
  flyby: { name: "Flyby", note: "arrive, no capture burn" },
  orbit: { name: "Orbit", note: "capture and circularize" },
  land:  { name: "Land",  note: "descend to the surface" },
};

/* Build the leg list for a destination + profile, including return legs. */
/* Stock system, from the Kopernicus dump. mu = geeASL*g0*R^2.
   ascent = surface <-> low orbit, the one figure worth keeping tabulated
   because it is dominated by drag and gravity losses, not orbital mechanics. */
const SYS = {
  Sun:   {parent:null,     R:261600000, gee:1.74684656},
  Moho:  {rot:1210000, inc:7.0, lan:70, parent:"Sun",    R:250000,  gee:0.275093947, sma:5263138304,  ascent:870},
  Eve:   {rot:80500, inc:2.1, lan:15, parent:"Sun",    R:700000,  gee:1.700580776, sma:9832684544,  ascent:8000, atm:90000},
  Gilly: {rot:28255, inc:12.0, lan:80, parent:"Eve",    R:13000,   gee:0.005001708, sma:31500000,    ascent:30},
  Kerbin:{rot:21549, inc:0, lan:0, parent:"Sun",    R:600000,  gee:1.000341605, sma:13599840256, ascent:3400, atm:70000},
  Mun:   {rot:138984, inc:0, lan:0, parent:"Kerbin", R:200000,  gee:0.166056700, sma:12000000,    ascent:580},
  Minmus:{rot:40400, inc:6.0, lan:78, parent:"Kerbin", R:60000,   gee:0.050017081, sma:47000000,    ascent:180},
  Duna:  {rot:65518, inc:0.06, lan:135.5, parent:"Sun",    R:320000,  gee:0.300102493, sma:20726155264, ascent:1450, atm:50000},
  Ike:   {rot:65518, inc:0.2, lan:0, parent:"Duna",   R:130000,  gee:0.112038263, sma:3200000,     ascent:390},
  Dres:  {rot:34800, inc:5.0, lan:280, parent:"Sun",    R:138000,  gee:0.115039285, sma:40839348203, ascent:430},
  Jool:  {rot:36000, inc:1.304, lan:52, parent:"Sun",    R:6000000, gee:0.800273296, sma:68773560320, atm:200000, noLand:true},
  Laythe:{rot:52981, inc:0, lan:0, parent:"Jool",   R:500000,  gee:0.800273296, sma:27184000,    ascent:2900, atm:50000},
  Vall:  {rot:105962, inc:0, lan:0, parent:"Jool",   R:300000,  gee:0.235080277, sma:43152000,    ascent:860},
  Tylo:  {rot:211926, inc:0.025, lan:0, parent:"Jool",   R:600000,  gee:0.800273296, sma:68500000,    ascent:2270},
  Bop:   {rot:544507, inc:15.0, lan:10, parent:"Jool",   R:65000,   gee:0.060020495, sma:128500000,   ascent:220},
  Pol:   {rot:901903, inc:4.25, lan:2, parent:"Jool",   R:44000,   gee:0.038012981, sma:179890000,   ascent:130},
  Eeloo: {rot:19460, inc:6.15, lan:50, parent:"Sun",    R:210000,  gee:0.172058762, sma:90118820000, ascent:620},
};
const mu = (b) => SYS[b].gee*G0*SYS[b].R**2;
const lowAlt = (b) => SYS[b].atm ? SYS[b].atm+10000 : 10000;
const lowR  = (b) => SYS[b].R + lowAlt(b);
const vCirc = (b) => Math.sqrt(mu(b)/lowR(b));
/* Synchronous orbit: the radius whose period matches the body's own rotation.
   It only exists if it clears the atmosphere and still sits inside the sphere of
   influence — which is why no tidally locked moon has one, since its synchronous
   radius is its own orbit around the planet. */
const syncR = (b) => Math.cbrt(mu(b)*SYS[b].rot*SYS[b].rot/(4*Math.PI*Math.PI));
const soiR  = (b) => SYS[b].parent && SYS[SYS[b].parent].sma !== undefined || SYS[b].parent
  ? SYS[b].sma*Math.pow(mu(b)/mu(SYS[b].parent),0.4) : Infinity;
function hasSync(b){
  if (!SYS[b] || !SYS[b].rot) return false;
  const r = syncR(b);
  return r > SYS[b].R + (SYS[b].atm||0) + 5000 && r < soiR(b)*0.9;
}
const chainOf = (b) => { const c=[]; for(let x=b;x;x=SYS[x].parent) c.push(x); return c; };

/* Hohmann between two circular orbits around `centre`; returns the hyperbolic
   excess needed at each end. */
function hohmann(centre,r1,r2){
  const m=mu(centre), at=(r1+r2)/2;
  const v1=Math.sqrt(m/r1), v2=Math.sqrt(m/r2);
  const vp=Math.sqrt(m*(2/r1-1/at)), va=Math.sqrt(m*(2/r2-1/at));
  return {out:Math.abs(vp-v1), in:Math.abs(v2-va)};
}
/* Burn from a circular orbit of speed v to leave with excess vinf (or the
   reverse, capturing from vinf into that circular orbit). */
const inject=(v,vinf)=>Math.sqrt(2*v*v+vinf*vinf)-v;

const RAD = Math.PI/180;
/* Destination labels are not always body names: DEST offers "Jool orbit",
   "Low Kerbin Orbit" and "Keostationary orbit". Resolve to a real body, or null
   when the target is just an orbit and no plane change applies. */
function bodyKey(name){
  if (SYS[name]) return name;
  return Object.keys(SYS).find(b => name.startsWith(b + " ")) || null;
}
/* Relative inclination between two orbits about the same primary. With both
   inclinations and ascending nodes known this is exact rather than |i1-i2|. */
function relInc(a,b){
  const i1=(SYS[a].inc||0)*RAD, i2=(SYS[b].inc||0)*RAD;
  const dl=((SYS[a].lan||0)-(SYS[b].lan||0))*RAD;
  return Math.acos(Math.min(1,Math.max(-1,
    Math.cos(i1)*Math.cos(i2) + Math.sin(i1)*Math.sin(i2)*Math.cos(dl))))/RAD;
}

/* A plane change costs 2·v·sin(Δi/2), so the only thing that matters is how
   slowly you are moving when you make it. At the transfer orbit's apoapsis you
   are crawling; down in low orbit you are not. Minmus is 5 m/s one way and
   239 m/s the other — the same manoeuvre.

   A route can need one at every level it passes through: reaching Bop means
   matching Jool's 1.3° against Kerbol and then Bop's 15° against Jool. */
function planeChanges(origin, dest) {
  const oB = bodyKey(origin), dB = bodyKey(dest);
  if (!oB || !dB || oB === dB) return [];
  const co = chainOf(oB), cd = chainOf(dB);
  const common = co.find((b) => cd.includes(b));
  const up = co.slice(0, co.indexOf(common));
  const down = cd.slice(0, cd.indexOf(common)).reverse();
  const out = [];
  const add = (deg, v, system, cheapV) => {
    if (deg < 0.15) return;
    const half = Math.sin(deg / 2 * RAD);
    out.push({ deg, system, cheap: Math.round(2 * (cheapV ?? v) * half),
      costly: Math.round(2 * v * half) });
  };

  // shedding the origin's own inclination on the way out
  up.forEach((b, k) => {
    if (k === up.length - 1) return;
    add(SYS[b].inc || 0, Math.sqrt(mu(up[k + 1]) / SYS[b].sma), up[k + 1]);
  });

  // the main one, at the level both bodies share
  const upEnd = up.length ? up[up.length - 1] : oB;
  const dnEnd = down.length ? down[0] : dB;
  if (upEnd !== dnEnd) {
    const r1 = up.length ? SYS[upEnd].sma : lowR(oB);
    const r2 = down.length ? SYS[dnEnd].sma : lowR(dB);
    const m = mu(common), at = (r1 + r2) / 2;
    add(relInc(upEnd, dnEnd), Math.sqrt(m / Math.min(r1, r2)), common,
        Math.sqrt(m * (2 / Math.max(r1, r2) - 1 / at)));
  }

  // and matching each moon's plane on the way down
  down.forEach((b, k) => {
    const next = down[k + 1];
    if (!next) return;
    add(SYS[next].inc || 0, Math.sqrt(mu(b) / SYS[next].sma), b);
  });
  return out;
}

function transferDv(origin,dest){
  const co=chainOf(origin), cd=chainOf(dest);
  const common=co.find(b=>cd.includes(b));
  const up=co.slice(0,co.indexOf(common));
  const down=cd.slice(0,cd.indexOf(common)).reverse();
  const rO = up.length ? SYS[up[up.length-1]].sma : lowR(origin);
  const rD = down.length ? SYS[down[0]].sma : lowR(dest);
  const h = hohmann(common,rO,rD);
  const legs=[];
  /* Staying inside one system means no SOI to climb out of, so the Hohmann burn
     is the whole cost — running it through inject() would charge escape velocity
     on top and inflate a Mun trip by a quarter. */
  if (!up.length) {
    legs.push({label:`Low ${origin} orbit → ${dest} transfer`, dv:Math.round(h.out), kind:"transfer", body:dest});
  } else up.forEach((b,k)=>{
    const v = k===0 ? vCirc(b) : Math.sqrt(mu(b)/SYS[up[k-1]].sma);
    const vinf = k===up.length-1 ? h.out : 0;
    legs.push({label:`Leave ${b}`, dv:Math.round(inject(v,vinf)), kind:"transfer", body:b});
  });

  down.forEach((b,k)=>{
    const last = k===down.length-1;
    const vinf = k===0 ? h.in : 0;
    if (!last) {
      /* Passing through on the way to a moon: capture only just enough to be
         bound, with periapsis down at the moon's orbit. Circularising here and
         climbing back out again is what made a Jool trip look like 3 km/s. */
      const rp = SYS[down[k+1]].sma, m2 = mu(b);
      const dv = Math.sqrt(vinf*vinf + 2*m2/rp) - Math.sqrt(2*m2/rp);
      legs.push({label:`Capture into ${b} system`, dv:Math.round(dv), kind:"capture", body:b});
      const hh = hohmann(b, rp, rp);   // already at the moon's radius
      void hh;
    } else if (!up.length && k===0) {
      legs.push({label:`Circularise at ${b}`, dv:Math.round(h.in), kind:"capture", body:b});
    } else {
      legs.push({label:`Capture → low ${b} orbit`, dv:Math.round(inject(vCirc(b), vinf)), kind:"capture", body:b});
    }
  });
  /* Dropping from a moon to the planet it orbits: the destination is the centre
     we are already circling, so the arrival burn is just the circularisation. */
  if (!down.length) legs.push({label:`Circularise at ${dest}`, dv:Math.round(h.in), kind:"capture", body:dest});
  return legs;
}

const gOf = (b) => (SYS[b] ? SYS[b].gee * G0 : 9.81);

/* Kerbin departures keep the tabulated map legs — they are what players check
   against and they have been validated end to end. Every other origin is built
   from Hohmann transfers through the body tree, which reproduces those same map
   figures to within about a percent. */
function computedLegs(origin, destName) {
  const dB = bodyKey(destName);
  if (!SYS[origin] || !dB || origin === dB) return [];
  const legs = [], o = SYS[origin], d = SYS[dB];
  if (o.ascent) legs.push({ label: `${origin} surface → low orbit`, dv: o.ascent,
    kind: "ascent", body: origin, g: gOf(origin), atm: !!o.atm });
  transferDv(origin, dB).forEach((l) => legs.push({ ...l, g: gOf(l.body) }));
  if (d.ascent && !d.noLand) legs.push({ label: `Descent to ${dB} surface`,
    dv: d.ascent, kind: "land", body: dB, g: gOf(dB), atm: !!d.atm });
  return legs;
}

function buildRoute(destName, profile, chutes, origin = "Kerbin", returning = false, planeNow = false) {
  if (destName === "Low orbit" || destName === "Stationary orbit") {
    if (!SYS[origin] || !SYS[origin].ascent) return [];
    const legs = [{ label: `${origin} surface → low orbit`, dv: SYS[origin].ascent,
      kind: "ascent", body: origin, g: gOf(origin), atm: !!SYS[origin].atm }];
    if (destName === "Stationary orbit" && hasSync(origin)) {
      const r2 = syncR(origin), h = hohmann(origin, lowR(origin), r2);
      legs.push({ label: `Raise apoapsis to ${Math.round((r2 - SYS[origin].R) / 1000).toLocaleString()} km`,
        dv: Math.round(h.out), kind: "transfer", body: origin, g: gOf(origin) });
      legs.push({ label: "Circularise, one orbit per day", dv: Math.round(h.in),
        kind: "capture", body: origin, g: gOf(origin) });
    }
    return legs;
  }
  const base = origin === "Kerbin" && DEST[destName]
    ? DEST[destName].legs.map((l) => ({ ...l }))
    : computedLegs(origin, destName);
  if (!base.length) return [];

  /* Inclination is charged as its own leg, placed just before capture, because
     unlike everything else in the budget its cost is set by when you burn it
     rather than how much you need. */
  const pcs = planeChanges(origin, destName);
  if (pcs.length) {
    const at = base.findIndex((l) => l.kind === "capture");
    const rows = pcs.map((pc) => ({
      label: `Plane change ${pc.deg.toFixed(1)}° in the ${pc.system} system`,
      /* "Burn it at apoapsis" was misleading: arrive uncorrected and you are
         thousands of kilometres off the target's plane, far outside its sphere of
         influence, so there is nothing to arrive at. What actually happens is
         that you never leave the equatorial plane — you time the ejection so the
         encounter falls on the target's ascending or descending node, where the
         two orbits already cross. The few m/s is the residual trim near apoapsis
         once the encounter is visible, not a plane rotation. */
      /* Two clocks have to line up: the target must be at a node when you get
         there, and you must be at the right point in the parking orbit to leave.
         The second is easy — a low orbit comes round every half hour against a
         transfer measured in days, so there are hundreds of chances per node
         crossing and you are never more than a quarter of an orbit from one.
         What that leaves is a small along-track error, which is what the trim
         actually pays for. */
      note: planeNow
        ? `burn it out of low orbit and leave whenever you like — ${pc.costly} m/s `
          + `against ${pc.cheap} m/s if you wait for a node instead`
        : pc.cheap < pc.costly
        ? `the target crosses your plane at two nodes; aim the encounter at one. `
          + `Leave one transfer time before it gets there — the parking orbit comes `
          + `round every half hour, so the departure point is never the binding `
          + `constraint. ${pc.cheap} m/s trims what is left near apoapsis, against `
          + `${pc.costly} m/s to match planes in low orbit instead`
        : `${pc.cheap} m/s; cheaper from a high elliptical orbit if you can wait for the node`,
      /* Two ways to pay for inclination, and which one you want depends on
         whether you have a launch window to wait for. Node timing is nearly free
         but ties departure to the target's schedule; burning it out of low orbit
         costs many times more and goes whenever you like. */
      dv: planeNow ? pc.costly : pc.cheap, planeNow, cheap: pc.cheap, costly: pc.costly,
      kind: "plane", body: bodyKey(destName) || origin,
      g: gOf(bodyKey(destName) || origin), plane: pc,
    }));
    base.splice(at < 0 ? base.length : at, 0, ...rows);
  }
  let legs = base;

  if (profile === "flyby") legs = legs.filter((l) => l.kind !== "capture" && l.kind !== "land");
  else if (profile === "orbit") legs = legs.filter((l) => l.kind !== "land");

  // Parachutes / aerobraking credit on descent through an atmosphere.
  if (chutes) legs = legs.map((l) =>
    l.kind === "land" && l.atm ? { ...l, dv: Math.round(l.dv * 0.18), chuted: true } : l);

  /* Coming home is independent of how far in you went. What it costs depends on
     where you stopped: off the surface you must climb back to orbit, out of orbit
     you must break the capture burn again, and after a flyby you were never bound
     in the first place, so there is nothing to undo. */
  if (returning) {
    const landLeg = base.find((l) => l.kind === "land");
    const capLeg = base.find((l) => l.kind === "capture");
    const back = [];
    if (profile === "land" && landLeg)
      back.push({ label: `Ascent from ${landLeg.body} surface`, dv: landLeg.dv,
        kind: "ascentBack", body: landLeg.body, g: landLeg.g });
    else if (profile === "orbit" && capLeg)
      back.push({ label: `Escape ${capLeg.body} orbit`, dv: capLeg.dv,
        kind: "transfer", body: capLeg.body, g: capLeg.g });
    const home = base.filter((l) => l.kind === "transfer" || l.kind === "plane").reduce((s, l) => s + l.dv, 0);
    back.push({ label: `Return transfer to ${origin}`, dv: home, kind: "transfer",
      body: origin, g: gOf(origin) });
    back.push({ label: SYS[origin] && SYS[origin].atm
        ? `Aerobrake at ${origin} (heat shield)` : `Capture at ${origin}`,
      dv: SYS[origin] && SYS[origin].atm ? 0 : Math.round(vCirc(origin) * 0.41),
      kind: "aero", body: origin, g: gOf(origin), free: !!(SYS[origin] && SYS[origin].atm) });
    legs = legs.concat(back);
  }
  return legs;
}

/* --------------------------------- solver ---------------------------------
   Rocket equation with tankage. For propellant mass mp and structural
   coefficient k (tank dry mass per tonne of propellant):
       mf = P + E + k*mp        m0 = mf + mp        R = exp(dv / (Isp*g0))
   Solving for mp:
       mp = (R-1)(P+E) / (1 + k - R*k)
   Feasible only while R < (1+k)/k — for stock 9:1 tanks that caps a single
   stage at Isp*g0*ln(9).                                                   */
/* No cuts to begin with: the whole mission is solved as one span and the stage
   count is found automatically. Cuts are the user's tool for saying "this part
   flies on its own hardware", not something to presume. */
function defaultCuts() { return new Set(); }

function propellantFor(dv, dry, isp, k) {
  if (!isFinite(dv)) return null;
  const R = Math.exp(dv / (isp * G0));
  const den = 1 + k - R * k;
  if (den <= 1e-6) return null;
  const mp = (R - 1) * dry / den;
  return mp > 0 && mp < 1e5 ? mp : null;
}

function compatible(engine, tank) {
  const needs = engine.f.filter((x) => x !== "El");
  if (needs.includes("SF")) return false;
  if (needs.includes("Xe")) return tank.xe > 0;
  if (needs.includes("Mono")) return tank.mono > 0;
  if (needs.includes("Ox")) return tank.lf > 0 && tank.ox > 0;
  if (needs.includes("LF")) return tank.lf > 0 && tank.ox === 0;
  return false;
}
const SZ_DIA = { "0": 0.625, "1": 1.25, "1.5": 1.875, "2": 2.5, "3": 3.75, "4": 5,
  Mk2: 2.5, Mk3: 3.75, R: 1.25 };
/* "R" in a part's size list means it can be surface-attached — it is not a
   diameter. Treating it as 1.25 m put every 0.625 m tank that happens to be
   radially mountable (the whole Oscar line) into the 1.25 m group, so a stage
   could come out as FL-T400 + FL-T200 + Oscar-C + Oscar-A. Ignore it unless the
   part has no stack profile at all. */
/* Computed once per part and cached on it. A part's size classes never change,
   so this was recomputing the same answer millions of times — and doing it with
   a filter, a map and a spread, so three throwaway arrays each time. It was 23%
   of a solve on its own, with much of the garbage collection behind it. */
function computeDia(p) {
  let best = 0, sawStack = false;
  for (const z of p.sz) if (z !== "R") { sawStack = true; const d = SZ_DIA[z] || 1.25; if (d > best) best = d; }
  if (!sawStack) for (const z of p.sz) { const d = SZ_DIA[z] || 1.25; if (d > best) best = d; }
  return best || 1.25;
}
const diaOf = (p) => {
  const d = p._dia;
  return d !== undefined ? d : (p._dia = computeDia(p));
};

/* The stack diameters a part actually presents, ignoring surface attachment. A
   part spanning two of them is an adapter — which is how they must be spotted,
   because the name does not say so: "Kerbodyne ADTP-2-3" and "Mk2 Bicoupler" both
   bridge two sizes without the word "adapter" anywhere in them. Testing the name
   let those two through into the tank pool, so a stage could list the same part
   twice, once as tankage and once as its adapter. */
const stackDias = (p) => [...new Set(p.sz.filter((z) => z !== "R")
  .map((z) => SZ_DIA[z]).filter(Boolean))].sort((x, y) => x - y);
const isAdapter = (p) => stackDias(p).length > 1;

/* A part with no stack profile at all can only be surface-attached — the R-11
   'Baguette' and R-4 'Dumpling' are ovoids that bolt to the side of something,
   not cylinders you can put in a stack. They were being offered as ordinary
   tankage because diaOf falls back to treating "R" as 1.25 m, which is fine for
   sizing a radial booster and wrong for deciding what can be stacked. Radial
   tanks are not modelled as side-mounted loads, so for now they are simply not
   available as a stage's tankage. */
const isRadialOnly = (p) => stackDias(p).length === 0;

/* An engine may sit under a stack its own width or wider — that is what adapters
   and engine plates are for, and it is how a Vector cluster ends up beneath a 5 m
   Kerbodyne tank. It may not feed off a stack narrower than itself. Radial
   engines hang off the side and take whatever they are bolted to.

   Tanks are then grouped by diameter below, so a stage stays one clean cylinder
   with a single adapter at the engine. Ungrouped, this rule produced stages
   mixing 5 m, 3.75 m, 1.25 m and 0.625 m tanks in one stack: a few percent
   lighter and nobody's idea of a rocket. */
const sizeMatch = (e, t) => e.sz.includes("R") || diaOf(t) >= diaOf(e);

/* How many of an engine you can realistically mount on a stack of its size. */
/* Clustering needs something to bolt the engines to, and the only stock parts
   that do it have 1.25 m outlets. So a 2.5 m or 3.75 m engine cannot be clustered
   at all without Making History's engine plates, and the old table — which
   cheerfully allowed seven engines on a 2.5 m stack — was describing parts that
   do not exist. Radial engines are the exception: they surface-attach and need
   no coupler. */
/* Shroud lengths, read from each variant's node_stack_bottom offset in the
   ReStock+ config, with the mass that goes with it. You fit the shortest that
   clears the engine — a 0.97 m Terrier needs Medium-Short on an EP-18, because
   Short only clears 0.675 m. Since engine heights are measured from the drag
   cubes, the tool can just pick rather than leaving it to you. */
const PLATE_SHROUD = {"EP-12 Engine Plate":[{"v":"Short","len":0.625,"m":0.052},{"v":"Medium-Short","len":1.25,"m":0.0545},{"v":"Medium","len":1.875,"m":0.057},{"v":"Medium-Long","len":2.5,"m":0.0595},{"v":"Long","len":3.75,"m":0.062}],"EP-18 Engine Plate":[{"v":"Short","len":0.675,"m":0.12},{"v":"Medium-Short","len":1.3,"m":0.125},{"v":"Medium","len":1.925,"m":0.13},{"v":"Medium-Long","len":2.55,"m":0.135},{"v":"Long","len":3.8,"m":0.14}],"EP-25 Engine Plate":[{"v":"Short","len":0.675,"m":0.21},{"v":"Medium-Short","len":1.3,"m":0.22},{"v":"Medium","len":1.925,"m":0.23},{"v":"Medium-Long","len":2.55,"m":0.24},{"v":"Long","len":3.8,"m":0.25}],"EP-37 Engine Plate":[{"v":"Short","len":1.3,"m":0.48},{"v":"Medium-Short","len":1.925,"m":0.505},{"v":"Medium","len":2.55,"m":0.53},{"v":"Medium-Long","len":3.8,"m":0.555},{"v":"Long","len":5.05,"m":0.58}],"EP-50 Engine Plate":[{"v":"Short","len":1.3,"m":0.85},{"v":"Medium-Short","len":1.925,"m":0.8875},{"v":"Medium","len":2.55,"m":0.925},{"v":"Medium-Long","len":3.8,"m":0.9625},{"v":"Long","len":5.05,"m":1.0}]};

const shroudFor = (plateName, engineHeight) => {
  const vs = PLATE_SHROUD[plateName];
  if (!vs) return null;
  return vs.find((v) => v.len >= engineHeight) || vs[vs.length - 1];
};

/* Engine plates from ReStock+. Confirmed in game on the EP-12: single mounts one
   engine at the plate's own size, then double, triple and quad mount 0.625 m
   engines. The larger plates follow the same pattern one size down. A plate is a
   coupler that also decouples — it carries ModuleDecouple and a jettisonable
   shroud — so a stage using one needs no separate decoupler.

   This is what lets small engines cluster at all: every TVR coupler has 1.25 m
   outlets, so a Spark or an Ant could never be grouped before. */
const COUPLERS = [{"n":"TVR-200 Stack Bi-Coupler","out":2,"dia":1.25,"top":1.25,"m":0.1,"cost":400,"t":"Specialized Construction"},{"n":"TVR-1180C Mk1 Stack Tri-Coupler","out":3,"dia":1.25,"top":1.25,"m":0.15,"cost":680,"t":"Advanced Construction"},{"n":"TVR-2160C Mk2 Stack Quad-Coupler","out":4,"dia":1.25,"top":1.25,"m":0.175,"cost":2000,"t":"Advanced Metalworks"},{"n":"TVR-200L Stack Bi-Adapter","out":2,"dia":1.25,"top":2.5,"m":0.1,"cost":400,"t":"Meta-Materials"},{"n":"TVR-400L Stack Quad-Adapter","out":4,"dia":1.25,"top":2.5,"m":0.2,"cost":800,"t":"Meta-Materials"},{"n":"EP-12 Engine Plate","out":2,"dia":0.625,"top":1.25,"m":0.062,"cost":200,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-12 Engine Plate","out":3,"dia":0.625,"top":1.25,"m":0.062,"cost":200,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-12 Engine Plate","out":4,"dia":0.625,"top":1.25,"m":0.062,"cost":200,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-18 Engine Plate","out":2,"dia":1.25,"top":1.875,"m":0.14,"cost":250,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-18 Engine Plate","out":3,"dia":1.25,"top":1.875,"m":0.14,"cost":250,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-18 Engine Plate","out":4,"dia":1.25,"top":1.875,"m":0.14,"cost":250,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-25 Engine Plate","out":2,"dia":1.25,"top":2.5,"m":0.25,"cost":300,"t":"Specialized Construction","plate":1,"rs":1},{"n":"EP-25 Engine Plate","out":3,"dia":1.25,"top":2.5,"m":0.25,"cost":300,"t":"Specialized Construction","plate":1,"rs":1},{"n":"EP-25 Engine Plate","out":4,"dia":1.25,"top":2.5,"m":0.25,"cost":300,"t":"Specialized Construction","plate":1,"rs":1},{"n":"EP-37 Engine Plate","out":2,"dia":2.5,"top":3.75,"m":0.58,"cost":500,"t":"Composites","plate":1,"rs":1},{"n":"EP-37 Engine Plate","out":3,"dia":2.5,"top":3.75,"m":0.58,"cost":500,"t":"Composites","plate":1,"rs":1},{"n":"EP-37 Engine Plate","out":4,"dia":2.5,"top":3.75,"m":0.58,"cost":500,"t":"Composites","plate":1,"rs":1},{"n":"EP-50 Engine Plate","out":2,"dia":3.75,"top":5,"m":1.0,"cost":700,"t":"Meta-Materials","plate":1,"rs":1},{"n":"EP-50 Engine Plate","out":3,"dia":3.75,"top":5,"m":1.0,"cost":700,"t":"Meta-Materials","plate":1,"rs":1},{"n":"EP-50 Engine Plate","out":4,"dia":3.75,"top":5,"m":1.0,"cost":700,"t":"Meta-Materials","plate":1,"rs":1},{"n":"EP-12 Engine Plate","out":5,"dia":0.625,"top":1.25,"m":0.062,"cost":200,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-12 Engine Plate","out":7,"dia":0.625,"top":1.25,"m":0.062,"cost":200,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-12 Engine Plate","out":9,"dia":0.625,"top":1.25,"m":0.062,"cost":200,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-18 Engine Plate","out":5,"dia":1.25,"top":1.875,"m":0.14,"cost":250,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-18 Engine Plate","out":7,"dia":1.25,"top":1.875,"m":0.14,"cost":250,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-18 Engine Plate","out":9,"dia":1.25,"top":1.875,"m":0.14,"cost":250,"t":"Advanced Construction","plate":1,"rs":1},{"n":"EP-25 Engine Plate","out":5,"dia":1.25,"top":2.5,"m":0.25,"cost":300,"t":"Specialized Construction","plate":1,"rs":1},{"n":"EP-25 Engine Plate","out":7,"dia":1.25,"top":2.5,"m":0.25,"cost":300,"t":"Specialized Construction","plate":1,"rs":1},{"n":"EP-25 Engine Plate","out":9,"dia":1.25,"top":2.5,"m":0.25,"cost":300,"t":"Specialized Construction","plate":1,"rs":1},{"n":"EP-37 Engine Plate","out":5,"dia":2.5,"top":3.75,"m":0.58,"cost":500,"t":"Composites","plate":1,"rs":1},{"n":"EP-37 Engine Plate","out":7,"dia":2.5,"top":3.75,"m":0.58,"cost":500,"t":"Composites","plate":1,"rs":1},{"n":"EP-37 Engine Plate","out":9,"dia":2.5,"top":3.75,"m":0.58,"cost":500,"t":"Composites","plate":1,"rs":1},{"n":"EP-50 Engine Plate","out":5,"dia":3.75,"top":5,"m":1.0,"cost":700,"t":"Meta-Materials","plate":1,"rs":1},{"n":"EP-50 Engine Plate","out":7,"dia":3.75,"top":5,"m":1.0,"cost":700,"t":"Meta-Materials","plate":1,"rs":1},{"n":"EP-50 Engine Plate","out":9,"dia":3.75,"top":5,"m":1.0,"cost":700,"t":"Meta-Materials","plate":1,"rs":1}];
const isRadial = (e) => e.sz.includes("R") && e.sz.filter((z) => z !== "R").length === 0;
function couplersFor(e, unlocked, excluded, expansions) {
  /* Engine plates ship with ReStock+; without it they are not in the game and
     must not appear in a design. */
  /* Hoisted: the engine does not change inside the filter, so asking for its
     diameter once per coupler was 35 lookups where one would do. */
  const ed = diaOf(e);
  return COUPLERS.filter((c) => c.dia === ed && (!c.t || unlocked.has(c.t))
    && !(c.rs && expansions && !expansions.rs)
    && !(excluded && excluded.has(c.n)));
}
const maxCluster = (e, unlocked, excluded) => {
  if (isRadial(e)) return 8;
  const c = couplersFor(e, unlocked || new Set(), excluded);
  return c.length ? Math.max(...c.map((x) => x.out)) : 1;
};
/* The coupler must have exactly as many outlets as there are engines. Leaving a
   node empty is buildable but puts the thrust off-axis, and the craft torques —
   two engines on a tri-coupler is not a cluster, it is a design fault. So a
   cluster size with no matching coupler is simply not offered. */
/* A coupler that fans one node out to `n` columns of diameter `d`. Parallel
   stacks need one at the top to mate with whatever sits above, and another at the
   bottom to gather back to a single node when there is a stage below. Stock
   couplers only have 1.25 m outlets, so wider columns simply cannot be joined —
   which is the honest answer, not something to model around. */
const columnCoupler = (d, n, unlocked, excluded) => {
  const fit = COUPLERS.filter((c) => c.dia === d && c.out === n
    && (!c.t || unlocked.has(c.t)) && !(excluded && excluded.has(c.n)));
  return fit.length ? fit.sort((a, b) => a.m - b.m)[0] : null;
};

const couplerFor = (e, n, unlocked, excluded, noPlate, expansions) => {
  if (n <= 1 || isRadial(e)) return null;
  const fit = couplersFor(e, unlocked, excluded, expansions)
    .filter((c) => c.out === n && !(noPlate && c.plate));
  return fit.length ? fit.sort((a, b) => a.cost - b.cost)[0] : null;
};

/* ---------------------------- structural parts ----------------------------
   An engine narrower than its stack needs an adapter, and stock adapters are
   themselves fuel tanks, so they add dry mass and carry propellant. Any part
   spanning two size classes is one; chain them where no single part bridges the
   gap (1.25 m to 3.75 m goes via the C7 and then the ADTP-2-3).

   Decouplers are not in the data set, so they are modelled on area, anchored to
   the TR-18A at 0.05 t on 1.25 m. Real figures would come from the part configs. */
/* Real structural parts, with the tech node each is gated behind. Masses and
   prices come straight from the configs; nothing here is modelled any more.
   Picking is by diameter among whatever is unlocked, cheapest first, so an early
   career design cannot quietly fit a part it has not researched. */
/* Every mass here is the part as it sits in the VAB: dry plus whatever it
   carries. KSP's config `mass` field is dry only, so a 2.5 m heat shield reads
   0.5 t there and weighs 1.3 t on the pad once its 800 units of ablator count.
   Same trap as the Castor booster. */
const STRUCT = {"decoupler":[{"n":"TD-06 Decoupler","m":0.01,"cost":150.0,"d":0.625,"t":"Precision Engineering"},{"n":"TD-12 Decoupler","m":0.04,"cost":200.0,"d":1.25,"t":"Engineering 101"},{"n":"TD-25 Decoupler","m":0.16,"cost":300.0,"d":2.5,"t":"General Construction"},{"n":"TD-37 Decoupler","m":0.36,"cost":375.0,"d":3.75,"t":"Large Volume Containment"},{"n":"TS-06 Stack Separator","m":0.01,"cost":215.0,"d":0.625,"t":"Miniaturization"},{"n":"TS-12 Stack Separator","m":0.05,"cost":275.0,"d":1.25,"t":"Advanced Construction"},{"n":"TS-25 Stack Separator","m":0.21,"cost":400.0,"d":2.5,"t":"Specialized Construction"},{"n":"TS-37 Stack Separator","m":0.48,"cost":500.0,"d":3.75,"t":"Composites"},{"n":"Hydraulic Detachment Manifold","m":0.4,"cost":770.0,"d":null,"t":"Advanced Construction"},{"n":"TT-38K Radial Decoupler","m":0.025,"cost":600.0,"d":null,"t":"Stability"},{"n":"TT-70 Radial Decoupler","m":0.05,"cost":700.0,"d":null,"t":"Advanced Construction"}],"parachute":[{"n":"Mk16 Parachute","m":0.1,"cost":422.0,"d":0.625,"t":"Start","drogue":false},{"n":"Mk12-R Radial-Mount Drogue Chute","m":0.075,"cost":150.0,"d":null,"t":"Survivability","drogue":true},{"n":"Mk16-XL Parachute","m":0.3,"cost":850.0,"d":1.25,"t":"Landing","drogue":false},{"n":"Mk2-R Radial-Mount Parachute","m":0.1,"cost":400.0,"d":null,"t":"Survivability","drogue":false},{"n":"Mk25 Parachute","m":0.2,"cost":400.0,"d":1.25,"t":"Advanced Landing","drogue":false}],"heatshield":[{"n":"Heat Shield (0.625m)","m":0.075,"cost":150.0,"d":0.625,"t":"Survivability"},{"n":"Heat Shield (1.25m)","m":0.3,"cost":300.0,"d":1.25,"t":"Survivability"},{"n":"Heat Shield (2.5m)","m":1.3,"cost":600.0,"d":2.5,"t":"Landing"},{"n":"Heat Shield (3.75m)","m":2.8,"cost":1100.0,"d":3.75,"t":"Advanced Landing"}],"leg":[{"n":"LT-1 Landing Struts","m":0.05,"cost":440.0,"d":null,"t":"Landing"},{"n":"LT-2 Landing Strut","m":0.1,"cost":340.0,"d":null,"t":"Advanced Landing"},{"n":"LT-05 Micro Landing Strut","m":0.015,"cost":200.0,"d":null,"t":"Survivability"}]};
const pickStruct = (kind, unlocked, d, excluded) => {
  let ok = STRUCT[kind].filter((x) => (!x.t || unlocked.has(x.t))
    && !(excluded && excluded.has(x.n)));
  // a drogue slows a descent, it does not land one — only fall back to it
  if (kind === "parachute" && ok.some((x) => !x.drogue)) ok = ok.filter((x) => !x.drogue);
  if (!ok.length) return null;
  const fit = d == null ? ok : ok.filter((x) => x.d === d);
  const pool = fit.length ? fit : ok.filter((x) => x.d == null || x.d >= (d || 0));
  return (pool.length ? pool : ok).sort((a, b) => a.cost - b.cost)[0];
};
/* Memoised. The answer depends only on the diameter and what is researched, and
   neither changes during a solve — but fitStructure asks for it on every single
   candidate, and each call filtered and sorted the decoupler table into three
   fresh arrays. Keyed on diameter, thrown away when the roster changes. */
let _decCache = new Map(), _decFor = null, _decEx = null;
const decouplerFor = (unlocked, d, excluded) => {
  if (unlocked !== _decFor || excluded !== _decEx) {
    _decCache = new Map(); _decFor = unlocked; _decEx = excluded;
  }
  const hit = _decCache.get(d);
  if (hit !== undefined) return hit;
  const v = pickStruct("decoupler", unlocked, d, excluded)
    || { n: "TD-12", m: 0.04, cost: 200, d };
  _decCache.set(d, v);
  return v;
};

/* Hardware the mission needs that no stage pays for, picked from what is
   actually researched. The parachute case matters most: an atmospheric descent
   already takes an 82% discount "because chutes", so flying them free was a
   straight subsidy — and flying them before Survivability is researched is
   worse. */
/* What the mission needs fitted, as a reminder rather than a charge. Which
   parachute or heat shield you pick changes the mass by several hundred kilos,
   and that is your call — so these are listed against the payload and their mass
   is assumed to be inside the figure you entered. The tool adds nothing.

   That does mean the 82% discount the route takes on an atmospheric descent is
   granted on trust: it assumes chutes are fitted, and if you leave them off the
   descent budget is wrong. Hence saying so plainly. */
function missionHardware(route, payload, origin, unlocked, excluded) {
  const items = [];
  const has = unlocked || new Set();
  const landsAtm = route.some((l) => l.kind === "land" && l.atm);
  const landsAny = route.some((l) => l.kind === "land");
  const aeroHome = route.some((l) => l.kind === "aero" && l.free);
  /* Chutes are needed for any descent through air — including the one at the end
     of a return trip. The route calls that leg an aerobrake and charges nothing
     for it, but you still have to touch down: a Minmus round trip lands on an
     airless moon and then comes home through Kerbin's atmosphere, and only the
     second of those needs canopies. */
  if (landsAtm || aeroHome) {
    const c = pickStruct("parachute", has, null, excluded);
    items.push({ name: c ? c.n : "parachutes", qty: Math.max(2, Math.ceil(payload / 1.5)),
      why: landsAtm ? "the descent budget assumes them" : `to land back on ${origin}` });
  }
  if (landsAny) {
    const l = pickStruct("leg", has, null, excluded);
    items.push({ name: l ? l.n : "landing legs", qty: 4, why: "to touch down on" });
  }
  if (aeroHome) {
    const d = Math.max(1.25, Math.cbrt(Math.max(payload, 0.1)) * 1.1);
    const h = pickStruct("heatshield", has, d < 1.9 ? 1.25 : d < 3 ? 2.5 : 3.75, excluded);
    items.push({ name: h ? h.n : "a heat shield", qty: 1, why: "for re-entry" });
  }
  return { items, mass: 0 };            // your payload figure covers them
}

let _adapterGraph = null;
function adapterGraph(tanks) {
  if (_adapterGraph) return _adapterGraph;
  const edges = new Map();   // "from>to" -> lightest spanning part
  tanks.forEach((t) => {
    const ds = stackDias(t);
    if (ds.length < 2 || /Mk2|Mk3/.test(t.sz.join())) return;
    const key = ds[0] + ">" + ds[ds.length - 1];
    if (!edges.has(key) || t.dry < edges.get(key).dry) edges.set(key, t);
  });
  _adapterGraph = edges;
  return edges;
}

/* Lightest chain of adapters taking an engine of diameter `from` up to a stack of
   diameter `to`. Returns null when no route exists. */
const _chainMemo = new Map();
/* Strip an adapter chain's propellant down to what the engine can actually use.
   The parts stay — they are structurally needed — but fuel with no matching
   oxidiser aboard is mass, not range. */
function usableAdapterProp(chain, engine) {
  if (!chain || !chain.parts || !chain.parts.length) return chain;
  let prop = 0, dead = 0;
  for (const t of chain.parts) {
    if (compatible(engine, t)) prop += t.prop;
    else dead += t.prop;
  }
  if (dead === 0) return chain;
  return { ...chain, prop, dry: chain.dry + dead, deadProp: dead };
}

/* The structural parts a stage needs, in one place. Both solvers ask the same
   question — given an engine, how many of it, how many columns, and what tank
   diameter, what has to be fitted and what does it weigh — and each used to
   answer it separately. Five bugs in this session came from fixing one copy and
   not the other: couplers, the thrust limiter, the gimbal check, the cluster cap
   and a missing decoupler quantity. */
function fitStructure(opt) {
  const { engine, n, stacks = 1, stackD, tanks, unlocked, excluded,
          noPlate = false, expansions = null, plateAbove = false,
          hasStageBelow = false } = opt;
  const perEng = n / stacks;

  // coupling is per column: engines on separate stacks need nothing to join them
  const coup = couplerFor(engine, perEng, unlocked, excluded, noPlate, expansions);
  if (perEng > 1 && !coup && !isRadial(engine)) return null;

  const plated = !!(coup && coup.plate);
  const shroud = plated ? shroudFor(coup.n, heightOf(engine, 1)) : null;
  const coupM = shroud ? shroud.m : (coup ? coup.m : 0);

  /* Node sizes are advisory in KSP, so a narrower engine bolts straight onto a
     wider tank. An adapter is only needed the other way round. */
  const under = coup ? coup.top : diaOf(engine);
  const adapt = under > stackD
    ? usableAdapterProp(adapterChain(tanks, under, stackD), engine)
    : { parts: [], prop: 0, dry: 0, cost: 0 };
  if (!adapt) return null;

  /* A clustered stage presents one bottom node per engine and cannot mate to a
     single stack below without gathering them back — unless a plate is doing it,
     which already presents one node. */
  const split = coup && hasStageBelow;
  const rejoin = (split && !plated) ? coup : null;

  /* A plate on the stage above sits at that stage's bottom, which is this
     interface, so it separates the two and this stage buys nothing. */
  const dd = decouplerFor(unlocked, stackD, excluded);
  const nDec = plateAbove ? 0 : (split ? perEng * stacks : stacks);
  const dec = nDec === 0
    ? { m: 0, n: null, cost: 0, d: stackD, qty: 0, viaPlateAbove: true }
    : { m: dd.m * nDec, n: dd.n, cost: dd.cost * nDec, d: stackD, qty: nDec };

  // radial stacks never separate alone, so structure holds them, not decouplers
  const joiner = stacks > 1 ? radialJoin(unlocked, excluded) : null;
  const joins = joiner ? (stacks - 1) * 2 * joiner.m : 0;

  return { coup, plated, shroud, coupM, adapt, rejoin, dec, joiner, joins, perEng,
    dry: adapt.dry + dec.m + coupM + (rejoin ? rejoin.m : 0) + joins };
}

function adapterChain(tanks, from, to) {
  if (from >= to) return { parts: [], dry: 0, prop: 0 };
  const memo = from + ">" + to;
  if (_chainMemo.has(memo)) return _chainMemo.get(memo);
  const edges = adapterGraph(tanks);
  const dias = [...new Set([...edges.keys()].flatMap((k) => k.split(">").map(Number)))].sort((a, b) => a - b);
  let best = null;
  const walk = (at, used, dry, prop) => {
    if (used.length > 3) return;
    if (at === to) { if (!best || dry < best.dry) best = { parts: [...used], dry, prop }; return; }
    for (const nxt of dias) {
      if (nxt <= at || nxt > to) continue;
      const e = edges.get(at + ">" + nxt);
      if (!e) continue;
      walk(nxt, [...used, e], dry + e.dry, prop + e.prop);
    }
  };
  walk(from, [], 0, 0);
  _chainMemo.set(memo, best);
  return best;
}

/* The tank pool an engine can draw on depends only on the engine and the parts
   list — not on dv, payload or stage count. It was being rebuilt inside the
   cluster-size loop: 17 000 regex tests, 1 260 adapter walks and 1 260 sorts per
   solveStage call, times ~41 calls per solve. Built once and cached, keyed on
   the parts array itself so a tech-tree change invalidates it. */
const _poolCache = new WeakMap();
function poolsFor(engine, tanks) {
  let byEngine = _poolCache.get(tanks);
  if (!byEngine) { byEngine = new Map(); _poolCache.set(tanks, byEngine); }
  let got = byEngine.get(engine.n);
  if (got) return got;
  const pool = tanks.filter((t) => compatible(engine, t) && sizeMatch(engine, t)
    && !isAdapter(t) && !isRadialOnly(t));
  const groups = new Map();
  pool.forEach((t) => {
    const key = diaOf(t) + "|" + t.k;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  got = [...groups.values()].map((g) => {
    const usable = [...g].sort((x, y) => y.prop - x.prop);   // pre-sorted for pickTanks
    return { usable, k: usable[0].k, dia: diaOf(usable[0]),
      biggest: usable[0].prop, adapt: adapterChain(tanks, diaOf(engine), diaOf(usable[0])) };
  });
  byEngine.set(engine.n, got);
  return got;
}

/* Pick a real tank combination covering mp tonnes of propellant.
   Two candidates, because the right answer depends on what you are optimising:
     greedy   — largest tank while the shortfall still exceeds it, then the
                smallest that covers the remainder. Minimal overshoot, so minimal
                mass, but it can spend three tanks where two would do.
     fewest   — as few tanks as possible, accepting the overshoot.
   Asking for 14 t of 2.5 m tankage gave X200-16 + 2× X200-8 under the greedy
   alone: 16 t in three parts, where one X200-32 carries the same 16 t. */
/* Memo. The same tank group is asked for the same propellant over and over: the
   cost objective alone runs six passes over the identical engine × count ×
   column combinations, and different cluster counts often land on the same
   requirement. Keyed exactly — no rounding — so the answer is bit-identical to
   computing it, and cleared whenever the tank pool changes.

   The result is shared between callers. Nothing mutates it except liquidMounts
   adding a `funds` total, which is derived from the list and therefore the same
   value every time. */
/* The lookup was costing more than the work it saved: building
   `mp + "|" + maxTanks + "|" + objective` allocated a string on every one of a
   hundred and eighty thousand calls, then hashed it.

   Instead the memo hangs off the pool array itself — pools are cached, so the
   same array comes back every time — as a small fixed set of Maps, one per
   (objective, tank limit) pair. Those two have three and two possible values, so
   they index an array rather than forming part of a key. What is left is a
   property read, an array index, and a Map lookup on a plain number. */
const _OBJ_IX = { mass: 0, cost: 1, parts: 2 };
/* Capped. Propellant requirements are continuous, so a long search generates
   endless distinct keys — without a bound this grew until the heap gave out on a
   deep stack. Dropping the whole map when it fills is crude but right for this
   shape of access: entries are reused heavily within a pass and rarely after it,
   so the cost of a cold start is small and the memory is bounded. */
const TANK_MEMO_MAX = 20000;
let _tankHits = 0, _tankCalls = 0;
function pickTanksMemo(pool, mp, maxTanks, objective) {
  _tankCalls++;
  let slots = pool._memo;
  if (slots === undefined) { slots = pool._memo = []; }
  const ix = (_OBJ_IX[objective] || 0) * 2 + (maxTanks === 12 ? 1 : 0);
  let byProp = slots[ix];
  if (byProp === undefined) { byProp = slots[ix] = new Map(); }
  const hit = byProp.get(mp);
  if (hit !== undefined) { _tankHits++; return hit; }
  const v = pickTanksRaw(pool, mp, maxTanks, objective);
  if (byProp.size >= TANK_MEMO_MAX) byProp.clear();
  byProp.set(mp, v);
  return v;
}

function pickTanksRaw(pool, mp, maxTanks = 12, objective = "mass") {
  const sorted = pool;              // callers pass a descending-by-capacity list
  const smallestCovering = (need) => {
    for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i].prop >= need - 1e-9) return sorted[i];
    return null;
  };
  /* One pass, no Map, no spread, no reduce closures. This is called four to six
     times per pickTanks and pickTanks runs for every engine × count × column ×
     tank group, so the allocations here were the largest single source of
     garbage in a solve. Tank lists are a dozen entries at most, so the linear
     scan for an existing entry beats hashing. */
  const build = (chosen) => {
    const n = chosen.length;
    if (!n || n > maxTanks) return null;
    const list = [];
    let prop = 0, dryMass = 0;
    for (let i = 0; i < n; i++) {
      const t = chosen[i];
      prop += t.prop; dryMass += t.dry;
      let found = null;
      for (let j = 0; j < list.length; j++) if (list[j].t === t) { found = list[j]; break; }
      if (found) found.c++; else list.push({ t, c: 1 });
    }
    return { list, prop, dryMass, count: n };
  };

  const greedy = [];
  let left = mp;
  for (const t of sorted)
    while (left > t.prop * 0.999 && greedy.length < maxTanks) { greedy.push(t); left -= t.prop; }
  if (left > 1e-4) greedy.push(smallestCovering(left) || sorted[0]);

  const big = sorted[0];
  const whole = Math.max(0, Math.floor(mp / big.prop));
  const fewest = Array(whole).fill(big);
  const rest = mp - whole * big.prop;
  if (rest > 1e-6) fewest.push(smallestCovering(rest) || big);

  /* A third candidate for the cost objective: fill by best value rather than by
     size. Bigger stock tanks are genuinely cheaper per tonne — a Jumbo-64 is 180
     funds/t against an X200-8's 200 — so least-overshoot was the wrong proxy for
     cheapest. Some small tanks beat it outright: the R-11 'Baguette' is 185
     funds/t, which is why cost designs reach for handfuls of them. */
  const price = (t) => (t.cost != null ? t.cost : t.prop * TANK_FUNDS_PROP + t.dry * TANK_FUNDS_DRY);
  const byValue = [...sorted].sort((x, y) => price(x) / x.prop - price(y) / y.prop);
  const cheap = [];
  let owe = mp;
  for (const t of byValue)
    while (owe > t.prop * 0.999 && cheap.length < maxTanks) { cheap.push(t); owe -= t.prop; }
  if (owe > 1e-4) cheap.push(smallestCovering(owe) || byValue[0]);

  /* Greedy plus an early finish: take the largest tank while it still fits, but
     the moment one tank can cover what is left, use it and stop. Without this the
     greedy walks past a tank that would have finished the job — needing 23 t it
     took an X200-32 then two X200-8s, where an X200-32 and an X200-16 carry the
     same 24 t in one part fewer and for less money. */
  const tidy = [];
  let rem = mp;
  for (const t of sorted) {
    while (rem > t.prop * 0.999 && tidy.length < maxTanks) {
      tidy.push(t); rem -= t.prop;
      const cover = rem > 1e-4 && smallestCovering(rem);
      if (cover) { tidy.push(cover); rem = 0; break; }
    }
    if (rem <= 1e-4) break;
  }
  if (rem > 1e-4) { const c = smallestCovering(rem); if (c) tidy.push(c); }

  /* Consolidation pass. Whichever candidate wins, walk it once more and try to
     replace any two tanks with a single one carrying at least as much. Within a
     group every tank shares the same structural coefficient, so a single tank
     holding exactly the combined propellant weighs exactly the same — one part
     instead of two, for nothing. Where it would overshoot, only take it if the
     active objective says the trade is worth it. */
  const simplify = (set) => {
    if (!set) return set;
    /* Flatten with a loop; flatMap allocated an intermediate array per entry on
       top of the result. */
    const list = [];
    for (const x of set.list) for (let i = 0; i < x.c; i++) list.push(x.t);
    for (let pass = 0; pass < 6; pass++) {
      let swapped = false;
      outer:
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const combined = list[i].prop + list[j].prop;
          const one = smallestCovering(combined);
          if (!one || one === list[i] || one === list[j]) continue;
          const worthIt = objective === "parts" ? true
            : objective === "cost" ? price(one) <= price(list[i]) + price(list[j])
            : one.prop <= combined + 1e-9;          // same mass, or lighter
          if (!worthIt) continue;
          /* Splice in place rather than filtering into a fresh array and
             concatenating — this runs up to six passes over a quadratic scan, so
             it was allocating a new list on every successful swap. */
          list.splice(j, 1); list.splice(i, 1); list.push(one);
          swapped = true;
          break outer;
        }
      if (!swapped) break;
    }
    return build(list);
  };

  const cands = [build(greedy), build(fewest), build(cheap), build(tidy)].filter(Boolean);
  if (!cands.length) return null;
  const funds = (c) => c.list.reduce((a, x) => a + x.c * price(x.t), 0);
  const rank = (a, b) =>
    objective === "parts" ? a.count - b.count || a.prop - b.prop
    : objective === "cost" ? funds(a) - funds(b) || a.count - b.count
    : a.prop - b.prop || a.count - b.count;
  cands.sort(rank);
  const win = cands[0];
  const tidied = simplify(win);
  return tidied && rank(tidied, win) <= 0 ? tidied : win;
}

/* Solve one stage: returns the lightest engine/tank set meeting dv and TWR. */
/* ---------------------- pressure-corrected performance ----------------------
   Stock atmosphereCurve is three keys: vacuum, sea level, then a cutoff where the
   engine quits, somewhere between 3 and 12 atm. Without the real cfg files the
   cutoff is inferred from how sea-level-tolerant an engine already is — vacuum
   bells like the Terrier give up early, sea-level bells like the Vector hold on.
   This is the one assumption real part files would replace.

   The pressure a stage actually burns at was measured by running the simulator
   over Kerbin, Duna and Laythe designs and taking the propellant-weighted mean:
   the first stage averages 62% of surface pressure, the second 5%, the third
   effectively none. */
const STAGE_PRESSURE = [0.62, 0.05, 0, 0];
/* Real atmosphereCurve keys, lifted from the part configs. Two-value keys carry
   zero tangents, which is what KSP's FloatCurve does with them.
   These replace an inferred cutoff of 3 + 9*(Isp_asl/Isp_vac) that turned out to
   be wrong by 3.4 atm on average and correct for only 4 engines in 60. It ran
   systematically optimistic for vacuum bells — a Terrier was given a 5.2 atm
   cutoff against a real 3.0, so it was still credited with thrust at pressures
   where it actually produces nothing. Everything computed at Eve moved. */
const REAL_CURVE = {"THK \"Pollux\"":[[0.0,225.0,0,0],[1.0,200.0,0,0],[7.0,0.001,0,0]],"ReStock+ 1.875 m tank 1":[[0.0,154.0,0,0],[1.0,118.0,0,0],[6.0,0.001,0,0]],"Sepratron I":[[0.0,154.0,0,0],[1.0,118.0,0,0],[6.0,0.001,0,0]],"Mk-1H 'Torch' Liquid Fuel Engine":[[0.0,295.0,0,0],[1.0,275.0,0,0],[12.0,0.001,0,0]],"LV-T15 'Valiant' Liquid Fuel Engine":[[0.0,270.0,0,0],[1.0,240.0,0,0],[7.0,0.001,0,0]],"UR-2 'Caravel' Liquid Fuel Engine":[[0.0,320.0,0,0],[1.0,265.0,0,0],[9.0,0.001,0,0]],"UR-1 'Galleon' Liquid Fuel Engine":[[0.0,305.0,0,0],[1.0,290.0,0,0],[9.0,0.001,0,0]],"UR-137 'Schnauzer' Liquid Fuel Engine":[[0.0,350.0,0,0],[1.0,70.0,0,0],[3.0,0.001,0,0]],"RK-107 'Ursa' Liquid Fuel Engine":[[0.0,300.0,0,0],[1.0,285.0,0,0],[9.0,0.001,0,0]],"KR-1 'Boar' Liquid Fuel Engine":[[0.0,300.0,0,0],[1.0,280.0,0,0],[12.0,0.001,0,0]],"LV-N410 'Cherenkov' Atomic Rocket Motor":[[0.0,820.0,0,0],[1.0,200.0,0,0],[2.0,0.01,0,0]],"KR-10A 'Corgi' Liquid Fuel Engine Cluster":[[0.0,355.0,0,0],[1.0,95.0,0,0],[12.0,0.001,0,0]],"RK-1 'Trash Panda' Vernier Engine":[[0.0,300.0,0,0],[1.0,285.0,0,0],[7.0,0.001,0,0]],"Launch Escape System Jr.":[[0.0,180.0,0,0],[1.0,160.0,0,0],[8.0,0.001,0,0]],"TCK-2 'Castor' Solid Rocket Booster":[[0.0,225.0,0,0],[1.0,200.0,0,0],[7.0,0.001,0,0]],"FL-S1200 Liquid Fuel Tank":[[0.0,154.0,0,0],[1.0,118.0,0,0],[6.0,0.001,0,0]],"LV-303 'Pug' Liquid Fuel Engine":[[0.0,330.0,0,0],[1.0,150.0,0,0],[2.0,0.001,0,0]],"24-77 \"Twitch\" Liquid Fuel Engine":[[0.0,290.0,0,0],[1.0,275.0,0,0],[7.0,0.001,0,0]],"48-7S \"Spark\" Liquid Fuel Engine":[[0.0,320.0,0,0],[1.0,265.0,0,0],[7.0,0.001,0,0]],"BACC \"Thumper\" Solid Fuel Booster":[[0.0,210.0,0,0],[1.0,175.0,0,0],[6.0,0.001,0,0]],"F3S0 \"Shrimp\" Solid Fuel Booster":[[0.0,215.0,0,0],[1.0,190.0,0,0],[7.0,0.001,0,0]],"FM1 \"Mite\" Solid Fuel Booster":[[0.0,210.0,0,0],[1.0,185.0,0,0],[7.0,0.001,0,0]],"IX-6315 \"Dawn\" Electric Propulsion System":[[0.0,4200.0,0,0],[1.0,100.0,0,0],[1.2,0.001,0,0]],"Kerbodyne KR-2L+ \"Rhino\" Liquid Fuel Engine":[[0.0,340.0,0,0],[1.0,205.0,0,0],[5.0,0.001,0,0]],"LFB KR-1x2 \"Twin-Boar\" Liquid Fuel Engine":[[0.0,300.0,0,0],[1.0,280.0,0,0],[9.0,0.001,0,0]],"LV-1 \"Ant\" Liquid Fuel Engine":[[0.0,315.0,0,0],[1.0,80.0,0,0],[3.0,0.001,0,0]],"LV-1R \"Spider\" Liquid Fuel Engine":[[0.0,290.0,0,0],[1.0,260.0,0,0],[8.0,0.001,0,0]],"LV-909 \"Terrier\" Liquid Fuel Engine":[[0.0,345.0,0,0],[1.0,85.0,0,0],[3.0,0.001,0,0]],"LV-N \"Nerv\" Atomic Rocket Motor":[[0.0,800.0,0,0],[1.0,185.0,0,0],[2.0,0.001,0,0]],"LV-T30 \"Reliant\" Liquid Fuel Engine":[[0.0,310.0,0,0],[1.0,265.0,0,0],[7.0,0.001,0,0]],"LV-T45 \"Swivel\" Liquid Fuel Engine":[[0.0,320.0,0,0],[1.0,250.0,0,0],[6.0,0.001,0,0]],"Mk-55 \"Thud\" Liquid Fuel Engine":[[0.0,305.0,0,0],[1.0,275.0,0,0],[9.0,0.001,0,0]],"O-10 \"Puff\" MonoPropellant Fuel Engine":[[0.0,250.0,0,0],[1.0,120.0,0,0],[4.0,0.001,0,0]],"RE-I5 \"Skipper\" Liquid Fuel Engine":[[0.0,320.0,0,0],[1.0,280.0,0,0],[6.0,0.001,0,0]],"RE-L10 \"Poodle\" Liquid Fuel Engine":[[0.0,350.0,0,0],[1.0,90.0,0,0],[3.0,0.001,0,0]],"RE-M3 \"Mainsail\" Liquid Fuel Engine":[[0.0,310.0,0,0],[1.0,285.0,0,0],[9.0,0.001,0,0]],"RT-10 \"Hammer\" Solid Fuel Booster":[[0.0,195.0,0,0],[1.0,170.0,0,0],[7.0,0.001,0,0]],"RT-5 \"Flea\" Solid Fuel Booster":[[0.0,165.0,0,0],[1.0,140.0,0,0],[6.0,0.001,0,0]],"S1 SRB-KD25k \"Kickback\" Solid Fuel Booster":[[0.0,220.0,0,0],[1.0,195.0,0,0],[7.0,0.001,0,0]],"S2-17 \"Thoroughbred\" Solid Fuel Booster":[[0.0,230.0,0,0],[1.0,205.0,0,0],[7.0,0.001,0,0]],"S2-33 \"Clydesdale\" Solid Fuel Booster":[[0.0,235.0,0,0],[1.0,210.0,0,0],[7.0,0.001,0,0]],"S3 KS-25 \"Vector\" Liquid Fuel Engine":[[0.0,315.0,0,0],[1.0,295.0,0,0],[12.0,0.001,0,0]],"S3 KS-25x4 \"Mammoth\" Liquid Fuel Engine":[[0.0,315.0,0,0],[1.0,295.0,0,0],[12.0,0.001,0,0]],"T-1 Toroidal Aerospike \"Dart\" Liquid Fuel Engine":[[0.0,340.0,-50.0,-73.71224],[1.0,290.0,-21.23404,-21.23404],[5.0,230.0,-10.54119,-10.54119],[10.0,170.0,-13.59091,-13.59091],[20.0,0.001,0,0]]};
const ispCut = (e) => Math.min(12, Math.max(3, 3 + 9 * (e.ia / e.iv)));
const _ispFns = new Map();
function ispAt(e, p) {
  if (!p) return e.iv;
  let f = _ispFns.get(e.n);
  if (!f) {
    const real = REAL_CURVE[e.n];
    f = real ? (x) => evalCurve(real, x) : ispCurve(e.iv, e.ia, ispCut(e));
    _ispFns.set(e.n, f);
  }
  return Math.max(0, f(p));
}

/* --------------------------- what counts as "best" ---------------------------
   Engine, tank and decoupler prices all come from the part configs now. These
   constants remain only as a fallback for a part with no cost recorded — 92 funds
   per tonne of propellant plus a structural term, which is roughly where the
   stock line sits. Worth knowing that tanks are the larger share: on a cheapest
   Mun landing they are about 62% of the funds against 38% for engines and
   boosters, so the leverage on cost is in how much propellant a design needs,
   not in which engine burns it. */
const TANK_FUNDS_PROP = 92, TANK_FUNDS_DRY = 1250, DECOUPLER_FUNDS = 75;

/* Prices are real now — every tank and decoupler carries the figure from its
   config. Only a part with no cost recorded falls back to the old model. */
function stageCost(c) {
  const est = (t) => (t.cost != null ? t.cost
    : t.prop * TANK_FUNDS_PROP + t.dry * TANK_FUNDS_DRY);
  let f = c.n * c.engine.cost + (c.decoupler ? c.decoupler.cost : DECOUPLER_FUNDS)
    + (c.coupler ? c.coupler.cost : 0) + (c.rejoin ? c.rejoin.cost : 0)
    + (c.packed ? c.packed.cost : 0)
    + (c.joiner ? ((c.stacks || 1) - 1) * 2 * c.joiner.cost : 0);
  if (c.tanks) f += c.tanks.list.reduce((a, x) => a + x.c * est(x.t), 0);
  if (c.adapters) f += c.adapters.parts.reduce((a, t) => a + est(t), 0);
  /* A liquid radial column costs its engine plus its tanks, not just the engine —
     reporting only the engine made columns look cheap, and the cost objective
     picked them over designs that were genuinely cheaper. */
  if (c.boosters) f += c.boosters.n * (c.boosters.part.cost
    + (c.boosters.part.column ? c.boosters.part.column.funds || 0 : 0)
    + DECOUPLER_FUNDS);
  return f;
}
const stageParts = (c) =>
  c.n + (c.tanks ? c.tanks.count : 0) + (c.adapters ? c.adapters.parts.length : 0)
  + (c.coupler ? 1 : 0) + (c.rejoin ? 1 : 0)
  + (c.packed ? c.packed.cols * 2 : 0)
  + ((c.stacks || 1) - 1) * 2
  + (c.decoupler && c.decoupler.qty ? c.decoupler.qty : 1)
  + (c.boosters ? c.boosters.n * (2 + (c.boosters.part.column
      ? c.boosters.part.column.count : 0)) : 0);

/* Selection is greedy per stage: a cheap-but-heavy upper stage makes everything
   below it bigger, and a stage cannot see that while it is being sized. Mass is
   kept as the tiebreak so the myopia stays bounded. */
/* Selecting greedily per stage is myopic — a cheap heavy upper stage makes
   everything below it bigger. These couplings price that downstream effect back
   in, and were fitted by sweeping: without them the cost objective came out
   dearer than the mass objective on two of six test missions. A moderate mass
   term also helps the part count, since lighter stages need fewer tanks. */
const COUPLE_COST = 1500, COUPLE_PARTS = 20;
function scoreOf(c, objective) {
  if (objective === "cost") return stageCost(c) + c.total * COUPLE_COST;
  if (objective === "parts") return stageParts(c) + c.total / COUPLE_PARTS;
  return c.total * (1 + 0.006 * (c.n + (c.tanks ? c.tanks.count : 0)));
}

function solveStage({ dv, payload, engines, tanks, unlocked, excluded, twrMin, g, pRef = 0, pSurf = 0, extra, maxBurn = 420, objective = "mass", needGimbal = false, hasStageBelow = false, noPlate = false, expansions = null, plateAbove = false, capCluster = 0 }) {
  if (!isFinite(dv) || dv <= 0) return null;   // refuse a nonsense requirement outright
  /* A stage that flies through air has to steer. Without a gimbal you are relying
     on fins and reaction wheels alone, which is how a launch ends up pinwheeling
     off the pad — so by default an atmospheric stage needs a vectoring nozzle.
     Solids never gimbal, which is exactly why they are strap-ons rather than
     cores. */
  const gimbalNeeded = needGimbal && pSurf > 0.02;
  let best = null;
  /* One scratch object, filled and re-filled. A stage design is built, scored,
     compared and thrown away tens of thousands of times per solve — only the few
     that become the new best need to outlive the iteration, so only those are
     copied. Everything the candidate points at (tanks, structure) is already a
     distinct object per candidate, so a shallow copy is enough. */
  const scratch = {};
  const keep = (c) => {
    const o = {};
    for (const k in c) o[k] = c[k];
    return o;
  };
  const consider = (cand) => {
    if (!cand) return;
    TALLY.stages++;
    /* A part with impossible bookkeeping — negative dry mass, fuel heavier than
       the whole part — produces a negative mass ratio and a NaN dv that then
       renders as "NaN m/s". Reject the candidate rather than let it through. */
    if (!isFinite(cand.total) || !isFinite(cand.dv) || !isFinite(cand.twr)
        || cand.total <= 0 || cand.dry <= 0 || cand.dv <= 0) return;
    cand.cost = stageCost(cand); cand.parts = stageParts(cand);
    cand.score = scoreOf(cand, objective);
    if (!best || cand.score < best.score) best = keep(cand);
  };

  for (const e of engines) {
    if (gimbalNeeded && !(e.gim > 0)) continue;

    const cap = maxCluster(e, unlocked, excluded);
    /* The cluster cap limits engines on one column, not engines on the stage. A
       Skipper cannot be clustered — no stock coupler has 2.5 m outlets — but
       three Skippers on three radial stacks need no coupler at all. Breaking out
       of this loop at the cap meant a 2.5 m engine could never appear more than
       once, which left heavy launches with no gimballed option and no design. */
    /* 5, 7 and 9 are the plates' 4x1, 6x1 and 8x1 patterns — one engine in the
       middle and four, six or eight around it. Nothing else mounts those counts,
       so without the plates in the table they were unreachable. */
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      if (n > cap * 9) break;
      if (capCluster && n > capCluster) continue;
      /* Some engines gimbal in one plane only — the Trash Panda's ModuleGimbal
         carries yMult = 0, which zeroes one axis. A pair steers in that plane and
         does nothing in the other, so the stack has no authority about one axis
         and departs as soon as anything disturbs it. Two perpendicular pairs
         restore full control, so require at least four. */
      if (gimbalNeeded && e.gim1 && n < 4) continue;
      /* A radial engine bolts to the side of the stack, so one on its own thrusts
         off the centreline and the craft yaws. Two or more placed on radial
         symmetry balance out — three at 120° is as sound as four at 90°, which is
         why this is a floor of two rather than a requirement to be even. */
      if (isRadial(e) && n < 2) continue;
      const ispE = ispAt(e, pRef);                  // efficiency over the burn
      if (ispE < 20) continue;                      // engine is dead at this pressure
      /* Below this count the stage cannot meet its thrust floor whatever else is
         chosen, because m0 is at least the payload it carries and thrust is
         exactly proportional to n. Everything under it is a wasted trip through
         tank selection and structure fitting.

         Both sides matter: the mass floor is payload plus fixed extras (never
         less), and the thrust is the engine's output at the pressure it lights
         at, not its vacuum rating — using vacuum thrust here would overstate what
         one engine does and let the bound sit too low to be worth having. */
      const thrust1 = e.fv * (ispAt(e, pSurf) / e.iv);
      if (n < Math.ceil(twrMin * (payload + extra) * g / thrust1)) continue;

      const thrust = n * e.fv * (ispAt(e, pSurf) / e.iv);   // thrust where it lights
      const mdot = (n * e.fv) / (e.iv * G0);        // mass flow is constant in KSP

      if (e.fuelM > 0) {
        /* Self-contained booster (SRB or Twin-Boar): can't tune propellant.

           More than one of these still has to hang off something. A radial part
           bolts to the side of the core and needs nothing, but a stack-mounted
           engine-and-tank like the Twin-Boar is a column: four of them side by
           side need a coupler or an engine plate at the top, exactly as four bare
           engines would. This branch skipped that check entirely, which is how
           four Twin-Boars appeared with nothing joining them to the stage above. */
        const selfCoup = (n > 1 && !isRadial(e))
          ? couplerFor(e, n, unlocked, excluded, noPlate, expansions) : null;
        if (n > 1 && !isRadial(e) && !selfCoup) continue;
        const selfShroud = selfCoup && selfCoup.plate
          ? shroudFor(selfCoup.n, heightOf(e, 1)) : null;
        const selfCoupM = selfShroud ? selfShroud.m : (selfCoup ? selfCoup.m : 0);
        const selfDec = plateAbove ? null : decouplerFor(unlocked, diaOf(e), excluded);
        const mf = payload + extra + n * e.dry + selfCoupM + (selfDec ? selfDec.m : 0);
        const m0 = payload + extra + n * e.m + selfCoupM + (selfDec ? selfDec.m : 0);
        const got = ispE * G0 * Math.log(m0 / mf);
        if (got < dv * 0.995) continue;
        const twr = thrust / (m0 * g);
        if (twr < twrMin) continue;
        scratch.engine = e; scratch.n = n; scratch.tanks = null; scratch.stacks = 1;
        scratch.adapters = null; scratch.rejoin = null; scratch.joiner = null; scratch.perStack = null;
        scratch.total = m0; scratch.wet = m0; scratch.dry = mf; scratch.burn = (n * e.fuelM) / mdot;
        scratch.coupler = selfCoup; scratch.shroud = selfShroud;
        scratch.decoupler = selfDec
          ? { m: selfDec.m, n: selfDec.n, cost: selfDec.cost, d: diaOf(e), qty: 1 }
          : { m: 0, n: null, cost: 0, d: diaOf(e), qty: 0, viaPlateAbove: true };
        scratch.boosters = null;
        scratch.dv = got; scratch.twr = twr; scratch.twrBurnout = thrust / (mf * g);
        scratch.prop = n * e.fuelM; scratch.isp = Math.round(ispE);
        consider(scratch);
        continue;
      }

      const groups = poolsFor(e, tanks);
      if (!groups.length) continue;
      const dryBase = payload + extra + n * e.m;

      for (const grp of groups) {          // one per tank diameter
      /* Parallel stacks. Nine tanks in a column is 30 m of rocket; the same
         propellant in three columns of three is a third of that and far easier to
         build. Each stack carries its own engines and its own tanks, all burning
         together and staged as one — mass is unchanged, height divides by the
         stack count, and the price is frontal area, since every column meets the
         air rather than hiding behind the one in front. */
      /* A central stack with radial stacks bolted around it. Unlike joining
         columns end to end, this needs only a radial decoupler per outer stack,
         so any diameter and any symmetric count works — which is why it is
         buildable where parallel columns were not. No crossfeed: each stack
         drains its own tanks, and since they are identical they burn out
         together, so the whole thing behaves as one large stage. */
      for (const stacks of [1, 3, 4, 5, 7, 9]) {
        if (n % stacks !== 0) continue;
        if (n / stacks > cap) continue;          // per column, the cap does apply
        if (stacks > 1 && isRadial(e)) continue;
        const { usable, k, dia: stackD, biggest } = grp;
        /* A cluster hangs off a coupler, so the adapter run starts at the coupler's
           upper face rather than the engine's own diameter. */
        const fit = fitStructure({ engine: e, n, stacks, stackD, tanks, unlocked, excluded,
          noPlate, expansions, plateAbove, hasStageBelow });
        if (!fit) continue;
        const { coup, shroud, coupM, adapt, rejoin, dec, joiner } = fit;
        const perEng = fit.perEng;
        const fixed = dryBase + fit.dry;

        const mp = propellantFor(dv, fixed, ispE, k);
        if (mp === null) continue;
        // Reject a diameter with no tank big enough to hold this propellant
        // sensibly — this is what stops 13x Oscar-B on a Spark.
        if (mp > 10 * biggest) continue;
        /* Size one column, then multiply — every stack is identical. */
        const per = Math.max(0.001, (mp - adapt.prop) / stacks);
        const one = pickTanksMemo(usable, per, 12, objective);
        if (!one) continue;
        const tk = stacks === 1 ? one : {
          list: one.list.map((x) => ({ t: x.t, c: x.c * stacks })),
          prop: one.prop * stacks, dryMass: one.dryMass * stacks,
          count: one.count * stacks, columnLen: null,
        };
        if (!tk) continue;
        const mf = fixed + tk.dryMass;
        const m0 = mf + tk.prop + adapt.prop;
        const got = ispE * G0 * Math.log(m0 / mf);
        if (got < dv * 0.995) continue;
        const twr = thrust / (m0 * g);
        if (twr < twrMin) continue;
        const burn = (tk.prop + adapt.prop) / mdot;
        if (burn > maxBurn) continue;    // rules out clusters of tiny engines on heavy stages
        scratch.engine = e; scratch.n = n; scratch.tanks = tk; scratch.adapters = adapt;
        scratch.decoupler = dec; scratch.coupler = coup; scratch.rejoin = rejoin;
        scratch.stacks = stacks; scratch.perStack = one; scratch.shroud = shroud;
        scratch.joiner = joiner; scratch.boosters = null;
        scratch.total = m0; scratch.wet = m0; scratch.dry = mf; scratch.burn = burn;
        scratch.dv = got; scratch.twr = twr; scratch.twrBurnout = thrust / (mf * g);
        scratch.prop = tk.prop + adapt.prop; scratch.isp = Math.round(ispE);
        consider(scratch);
      }
      }
    }
  }
  return best;
}

/* -------------------------- parallel solid boosters --------------------------
   Radial SRBs fire alongside the liquid core and are jettisoned at burnout, so
   the launch stage has two phases:
     A  boosters + core together, lasting t_b = booster fuel / booster flow
     B  core alone on whatever propellant phase A left it
   A KSP engine's mass flow is constant (mdot = F_vac / (Isp_vac·g0)); atmospheric
   thrust is just that flow times a lower Isp. So the combined Isp across phase A
   is total vacuum thrust over total flow — no averaging fudge required.        */
const RADIAL_DECOUPLER = 0.05;   // TT-38K, one per booster

/* Radial stacks burn with the core and are never dropped on their own, so what
   holds them on does not have to separate — it only has to be structure. The
   lightest thing in the game that surface-attaches and offers a stack node is the
   Cubic Octagonal Strut at 1 kg, against 50 kg for a radial decoupler. Charging
   the decoupler was fifty times too heavy per join. */
const RADIAL_JOIN = { n: "Cubic Octagonal Strut", m: 0.001, cost: 16, t: "Precision Engineering" };
const RADIAL_JOIN_FALLBACK = { n: "TT-38K Radial Decoupler", m: 0.05, cost: 600, t: "Advanced Construction" };
const radialJoin = (unlocked, excluded) =>
  ((!RADIAL_JOIN.t || unlocked.has(RADIAL_JOIN.t)) && !(excluded && excluded.has(RADIAL_JOIN.n)))
    ? RADIAL_JOIN : RADIAL_JOIN_FALLBACK;

/* Reading a pasted configuration. Each field is validated on its own and a bad
   or missing one is simply omitted, leaving that setting at its default — a
   config saved before a setting existed still restores everything else rather
   than failing whole. Kept separate from the component so it can be tested
   without one. */
function parseConfig(text) {
  let cfg;
  try { cfg = JSON.parse(String(text).replace(/^\s*KSP-PLANNER\s*/, "")); }
  catch { return { error: "That does not parse as a configuration." }; }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg))
    return { error: "That does not parse as a configuration." };

  const values = {};
  let took = 0, left = 0;
  const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
  const take = (key, ok, val) => { if (ok) { values[key] = val(); took++; } else left++; };
  const bodies = Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent);

  take("origin", bodies.includes(cfg.origin), () => cfg.origin);
  take("dest", typeof cfg.dest === "string" && cfg.dest.length > 0, () => cfg.dest);
  take("profile", ["flyby", "orbit", "land"].includes(cfg.profile), () => cfg.profile);
  take("returning", typeof cfg.returning === "boolean", () => cfg.returning);
  take("payload", num(cfg.payload, 0.01, 2000), () => cfg.payload);
  take("payloadDia", num(cfg.payloadDia, 0.1, 20), () => cfg.payloadDia);
  take("margin", num(cfg.margin, 0, 100), () => cfg.margin);
  take("extraDv", num(cfg.extraDv, 0, 20000), () => cfg.extraDv);
  take("objective", ["mass", "cost", "parts"].includes(cfg.objective), () => cfg.objective);
  take("boosters", typeof cfg.boosters === "boolean", () => cfg.boosters);
  take("chutes", typeof cfg.chutes === "boolean", () => cfg.chutes);
  take("needGimbal", typeof cfg.needGimbal === "boolean", () => cfg.needGimbal);
  take("planeNow", typeof cfg.planeNow === "boolean", () => cfg.planeNow);
  take("asparagus", typeof cfg.asparagus === "boolean", () => cfg.asparagus);
  take("maxAspect", num(cfg.maxAspect, 2, 100), () => cfg.maxAspect);
  take("expansions", cfg.expansions && typeof cfg.expansions === "object" && !Array.isArray(cfg.expansions),
    () => ({ mh: !!cfg.expansions.mh, rs: cfg.expansions.rs !== false }));
  take("tech", Array.isArray(cfg.tech) && cfg.tech.some((t) => DATA.nodes[t]),
    () => withDeps(DATA.nodes, new Set(cfg.tech.filter((t) => DATA.nodes[t]))));
  take("excluded", Array.isArray(cfg.excluded), () => new Set(cfg.excluded));
  take("cuts", cfg.cuts === null || Array.isArray(cfg.cuts),
    () => (cfg.cuts ? new Set(cfg.cuts) : null));
  take("splits", Array.isArray(cfg.splits), () => new Map(cfg.splits));
  return { values, took, left };
}

/* A tally of how much searching a solve actually did. Reset per run and read
   afterwards — a rough sense of the space is useful when a design looks odd, and
   it makes the cost of a wider search visible rather than only felt. */
const TALLY = { stages: 0, boosted: 0, flights: 0, chains: 0 };
const resetTally = () => { TALLY.stages = 0; TALLY.boosted = 0; TALLY.flights = 0; TALLY.chains = 0; };

function boostedAscent({ dv, payload, engines, tanks, unlocked, excluded, needGimbal, twrMin, g, extra, srbs, pRef = 0.62, pSurf = 1, objective = "mass", noLiquid = false, noPlate = false, expansions = null, asparagus = false }) {
  let best = null;

  /* Tank pools depend only on the core engine, so build them once. This runs
     inside a split search now, and re-filtering 64 tanks per combination was
     the whole cost of the function. */
  const cores = [];
  for (const c of engines) {
    /* A boosted core still flies through the whole atmosphere, so it needs to
       steer just as much as an unboosted one. This check was only in solveStage,
       which let a Reliant core through the moment boosters were involved. */
    if (needGimbal && pSurf > 0.02 && !(c.gim > 0)) continue;

    if (c.fuelM !== 0 || !c.f.includes("Ox")) continue;
    for (const grp of poolsFor(c, tanks))
      cores.push({ c, k: grp.k, usable: grp.usable, grp,
        cap: Math.min(4, maxCluster(c, unlocked, excluded)) });
  }
  if (!cores.length) return null;

  const mounts = [];
  for (const b of srbs) {
    if (!b.sz.includes("R")) continue;              // must be radially mountable
    const mdotB = b.fv / (b.iv * G0);
    const tB = b.fuelM / mdotB;                     // booster burn time, seconds
    if (tB < 20) continue;                          // too brief to be a stage
    mounts.push({ b, mdotB, tB });
  }

  /* Liquid radial stacks, as mounts. A column of engine plus tanks behaves
     exactly like a solid booster from the two-phase maths' point of view — it
     burns for a while alongside the core and is then dropped — so rather than
     write that again, a column is dressed up to expose the same five fields an
     SRB does: vacuum thrust, vacuum Isp, wet mass, propellant, dry mass. It also
     keeps the engine's own atmosphereCurve, so ispAt works on it unchanged.

     The free parameter is burn time. Fixing the engine to the core's own means
     the column is the same size as the core or smaller, which is the case worth
     covering and keeps the search bounded. Different burn times are the whole
     point: a shorter column drops earlier and lighter. */
  /* Side tanks with no engine on them. They feed the core through crossfeed and
     are dropped as they empty, so the stack sheds their dry mass part-way up
     instead of carrying it to burnout — the same mechanism asparagus uses, minus
     the engines. On identical propellant that is worth more, because an engine
     per stack is pure overhead unless the thrust is actually needed.

     What they do not give is thrust. Liftoff TWR is strictly worse than the same
     core without them, so they only work where the core has thrust to spare. */
  const tankMounts = (coreEngine, grp) => {
    const out = [];
    if (!grp || !grp.usable.length) return out;
    const mdot1 = coreEngine.fv / (coreEngine.iv * G0);
    /* Four sizes, not seven. A drop tank's value is a smooth function of how much
       propellant it holds, so the ladder does not need to be fine — and every rung
       multiplies through the booster-count and core-size search beneath it. */
    for (const tB of [60, 130, 260, 450]) {
      const prop = mdot1 * tB;
      const tk = pickTanksMemo(grp.usable, prop, 12, objective);
      if (!tk) continue;
      tk.funds = tk.list.reduce((a2, x) => a2 + x.c * (x.t.cost || 0), 0);
      out.push({
        b: { n: "drop tank", fv: 0, iv: coreEngine.iv, ia: coreEngine.ia,
             m: tk.dryMass + tk.prop, fuelM: tk.prop, dry: tk.dryMass,
             sz: coreEngine.sz, f: coreEngine.f, t: null,
             column: tk, dropTank: true, nEng: 0 },
        mdotB: 0, tB });
    }
    return out;
  };

  const liquidMounts = (coreEngine, grp) => {
    const out = [];
    if (!grp || !grp.usable.length) return out;
    const mdot1 = coreEngine.fv / (coreEngine.iv * G0);
    /* A column is normally sized as a booster: a short burn strapped to the side
       of a core that does the real work. Asparagus inverts that. Because the
       outermost pair feeds every engine, the side stacks want to be as large as
       the core or larger — that is where the gain lives, and it scales with how
       much of the rocket sits in them, not with how many there are. A 27 t column
       is worth about 4%; a 70 t column is worth 12%.

       So when the user asks for asparagus, the burn-time ladder is extended well
       past what makes sense for a booster. The tank limit goes up with it, since
       a full-size stack needs more than eight tanks. */
    for (const tB of (asparagus
        ? [30, 45, 60, 90, 130, 200, 300, 450, 650]   // extends the ladder, never shortens it
        : [30, 45, 60, 90, 130])) {
      const prop = mdot1 * tB;
      const tk = pickTanksMemo(grp.usable, prop, asparagus ? 12 : 8, objective);
      if (!tk) continue;
      const realT = tk.prop / mdot1;
      if (realT < 20) continue;
      const dry = coreEngine.m + tk.dryMass;
      // the column's own funds, so cost and part counts include its tanks
      tk.funds = tk.list.reduce((a2, x) => a2 + x.c * (x.t.cost || 0), 0);
      out.push({
        b: { ...coreEngine, fv: coreEngine.fv, m: dry + tk.prop,
             fuelM: tk.prop, dry, column: tk, nEng: 1 },
        mdotB: mdot1, tB: realT,
      });
    }
    return out;
  };

  /* Necessary condition, independent of which boosters get bolted on: once they
     separate the core alone must still make 0.85 TWR, and it can only get
     lighter than the payload it is already carrying. Anything failing this can
     never produce a valid design, so reject it before bisecting.
     This is the whole cost of the function — the search was making 89 million
     dvOf calls across 2.7 million combinations. */
  const floor = 0.85 * g * (payload + extra);
  const viable = [];
  for (const core of cores)
    for (let nc = isRadial(core.c) ? 2 : 1; nc <= core.cap; nc++)   // a lone radial thrusts off-axis
      // a one-plane gimbal needs two perpendicular pairs to control both axes
      if (!(needGimbal && pSurf > 0.02 && core.c.gim1 && nc < 4))
      if (nc * core.c.fv * (ispAt(core.c, pSurf) / core.c.iv) >= floor)
        viable.push({ core, nc });

  for (const { core, nc } of viable) {
    /* In vacuum there is nothing for a booster to do — solids and powered columns
       both exist to help climb out of air. Only drop tanks are worth trying up
       here, and trying the other two anyway made an asparagus solve seven times
       slower than a plain one for no possible gain. */
    const vac = pSurf <= 0.1;
    const all = noLiquid ? (vac ? [] : mounts)
      : vac
        ? (asparagus ? tankMounts(core.c, core.grp) : [])
        : mounts.concat(liquidMounts(core.c, core.grp),
            asparagus ? tankMounts(core.c, core.grp) : []);
    if (!all.length) continue;
    for (const { b, mdotB, tB } of all) {
      /* Asparagus drops in pairs, so odd counts waste a stack, and the technique
         is worth more the more pairs there are — real asparagus rockets run six
         to sixteen. Only widen the ladder for liquid columns: a ring of sixteen
         solid boosters is a different and worse idea. */
      /* Drop tanks are shed in pairs and their gain is nearly flat past a few of
         them, so the wide ladder is reserved for powered columns where it earns
         its search cost. */
      const counts = b.dropTank ? [2, 4, 6]
        : (asparagus && b.column) ? [2, 3, 4, 6, 8, 12, 16] : [2, 3, 4, 6, 8];
      for (const nb of counts) {
        {
          const { c, k, usable, grp, cap } = core;
          const mdotC = (nc * c.fv) / (c.iv * G0);
          /* Pressure comes from the body being left, not from Kerbin. Eve's
             surface is 5 atm, where the real curves put a Terrier at zero — its
             cutoff is 3 atm — while a Kickback still makes 51 s. The ranking does
             not just shift, it inverts. */
          const pR = pRef;
          const thr = (e, p) => e.fv * (ispAt(e, p) / e.iv);   // thrust at pressure p
          const ispEff = (nb * b.fv * (ispAt(b, pR) / b.iv) + nc * c.fv * (ispAt(c, pR) / c.iv))
            / ((nb * mdotB + mdotC) * G0);
          const ispCore = ispAt(c, pR);
          const stackD = grp.dia;
          const coup = couplerFor(c, nc, unlocked, excluded);
          const fit = fitStructure({ engine: c, n: nc, stacks: 1, stackD, tanks,
            unlocked, excluded, noPlate, expansions, plateAbove: false, hasStageBelow: false });
          if (!fit) continue;
          const { coupM, adapt, dec, shroud } = fit;
          const fixed = payload + extra + nc * c.m + nb * RADIAL_DECOUPLER + fit.dry;

          const coreBurnA = mdotC * tB;             // core propellant spent under boost

          /* Two ways the mounts can feed the core.

             Parallel: everything burns from its own tanks, the boosters run dry
             together and leave in one go. Two phases.

             Asparagus: the outermost pair feeds every engine on the rocket, so it
             empties while the core stays full, and pairs leave one at a time. The
             core arrives at the top of the stack still full, which is where the
             gain comes from — the same propellant does its work under a lighter
             and lighter rocket. It needs crossfeed, which on a radial decoupler is
             a right-click toggle and otherwise a pair of fuel ducts. */
          /* Under asparagus the core draws from the side stacks, not its own
             tanks, so it burns nothing of its own until the last pair is gone.
             The "core must outlast the boosters" rule is a parallel-staging
             assumption, and applying it here was rejecting every configuration
             where the ring carries most of the propellant — which is precisely
             the arrangement asparagus exists for. */
          /* Asparagus is an extra way to plumb the same hardware, not a
             replacement for the parallel arrangement. Evaluating a liquid column
             only as asparagus meant that whenever parallel happened to be better,
             enabling the option made the design worse — which it must never do. */
          const drop = !!b.dropTank;
          /* A drop tank has no engine, so there is nothing to plumb differently —
             it is always fed to the core and always shed in pairs. */
          const plumbings = drop ? [true]
            : (asparagus && nb >= 2 && !!b.column) ? [false, true] : [false];
          for (const aspHere of plumbings) {
          const burnA = aspHere ? 0 : coreBurnA;
          const dvOf = (mp) => {
            if (mp <= burnA * 1.02) return -1;      // core has to outlast the boosters
            const m0 = fixed + k * mp + mp + nb * b.m;
            /* Solids cannot do this. Asparagus works by draining one stack's
               propellant through every engine on the rocket, and solid fuel does
               not flow — a Kickback burns its own grain and nothing else's. Only
               liquid columns qualify. */
            if (drop) {
              /* Only the core burns. It draws from the side tanks first, a pair at
                 a time, dropping each pair's dry mass as it empties, and finishes
                 on its own propellant. No extra thrust and no extra flow — the
                 whole benefit is not carrying empty tankage to burnout. */
              const pairs = Math.floor(nb / 2);
              const perPair = 2 * b.fuelM, dryPair = 2 * b.dry;
              let m = m0, tot = 0;
              for (let q = 0; q < pairs; q++) {
                const mEnd = m - perPair;
                if (mEnd <= 0) return -1;
                tot += ispCore * G0 * Math.log(m / mEnd);
                m = mEnd - dryPair;
              }
              if (nb % 2) {
                const mEnd = m - b.fuelM;
                if (mEnd <= 0) return -1;
                tot += ispCore * G0 * Math.log(m / mEnd);
                m = mEnd - b.dry;
              }
              const mB1 = fixed + k * mp;
              if (m <= mB1) return -1;
              return tot + ispCore * G0 * Math.log(m / mB1);
            }
            if (!aspHere) {
              const mA = m0 - nb * b.fuelM - burnA;
              const mB0 = mA - nb * b.dry;          // boosters away
              const mB1 = fixed + k * mp;
              return ispEff * G0 * Math.log(m0 / mA) + ispCore * G0 * Math.log(mB0 / mB1);
            }
            /* Pairs drop one at a time. Each phase burns one pair's propellant
               through every engine still attached, so the phase is short and the
               rocket sheds a pair's dry mass at the end of it. */
            const pairs = Math.floor(nb / 2);
            const perPair = 2 * b.fuelM, dryPair = 2 * b.dry;
            let m = m0, total = 0;
            for (let q = 0; q < pairs; q++) {
              const mEnd = m - perPair;
              if (mEnd <= 0) return -1;
              total += ispEff * G0 * Math.log(m / mEnd);
              m = mEnd - dryPair;                   // that pair leaves
            }
            if (nb % 2) {                           // an odd one out burns alone
              const mEnd = m - b.fuelM;
              if (mEnd <= 0) return -1;
              total += ispEff * G0 * Math.log(m / mEnd);
              m = mEnd - b.dry;
            }
            const mB1 = fixed + k * mp;
            if (m <= mB1) return -1;
            return total + ispCore * G0 * Math.log(m / mB1);
          };

          // smallest core that still closes the budget
          let lo = aspHere ? 0.05 : coreBurnA * 1.03, hi = lo, found = dvOf(lo) >= dv;
          if (!found) {
            for (let i = 0; i < 18 && hi < 8000; i++) {
              hi *= 1.6;
              if (dvOf(hi) >= dv) { found = true; break; }
            }
          }
          if (!found) continue;
          for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            if (dvOf(mid) >= dv) hi = mid; else lo = mid;
          }

          const biggest = Math.max(...usable.map((t) => t.prop));
          if (hi > 10 * biggest) continue;
          const tk = pickTanksMemo(usable, hi, 12, objective);
          if (!tk) continue;

          const mp = tk.prop;
          if (mp <= burnA * 1.02) continue;
          const coreDry = fixed + tk.dryMass;
          const m0 = coreDry + mp + nb * b.m;
          const mA = m0 - nb * b.fuelM - coreBurnA;
          const mB0 = mA - nb * b.dry;
          const dvA = ispEff * G0 * Math.log(m0 / mA);
          const got = dvA + ispCore * G0 * Math.log(mB0 / coreDry);
          if (got < dv * 0.995) continue;

          const twr = (nb * thr(b, pSurf) + nc * thr(c, pSurf)) / (m0 * g);
          if (twr < twrMin) continue;
          /* The core has to keep flying once the boosters go. Without this the
             optimiser bolts on SRBs purely to pass the liftoff TWR check and
             leaves a sustainer that can't hold itself up. A real sustainer can
             sit a little under 1 by separation, already fast and climbing. */
          if ((nc * thr(c, pSurf)) / (mB0 * g) < 0.85) continue;
          /* Boosters that burn out in a handful of seconds are a crutch, not a stage. */
          if (dvA < dv * 0.08) continue;

          const cand = {
            engine: c, n: nc, tanks: tk, adapters: adapt, decoupler: dec, coupler: fit.coup, shroud,
            asparagus: aspHere, dropTank: drop,
            total: m0, wet: m0, dry: coreDry,
            prop: mp + nb * b.fuelM, isp: Math.round(ispEff), dv: got, twr,
            twrBurnout: (nc * thr(c, pSurf)) / (coreDry * g),
            burn: tB + (mp - coreBurnA) / mdotC,
            boosters: { part: b, n: nb, burn: tB, dv: dvA, sepMass: mA },
          };
          cand.cost = stageCost(cand); cand.parts = stageParts(cand);
          cand.score = scoreOf(cand, objective);
          TALLY.boosted++;
          if (!best || cand.score < best.score) best = cand;
        }
          }
      }
    }
  }
  return best;
}

/* --------------------------- stages within a segment ---------------------------
   One leg routinely needs more than one stage: 3 400 m/s to orbit is usually two,
   and Eve ascent is three or four. For k stages we search how the segment's dv is
   divided between them and keep the lightest stack. Shares are bottom-first, so
   index 0 fires first. The grid is deliberately coarse — a finer one moves the
   answer by well under a tonne and costs real interaction latency.            */
/* How a segment's dv is divided between k stages. Every entry must have exactly k
   elements: a short one leaves shares[i] undefined, the stage's requirement becomes
   NaN, and because every comparison against NaN is false it then passes the "did
   this deliver enough dv" test and a junk stage lands in the design. */
function splitShares(k) {
  if (k === 1) return [[1]];
  const out = [];
  if (k === 2) {
    for (let a = 0.3; a <= 0.701; a += 0.1) out.push([a, 1 - a]);
  } else if (k === 3) {
    for (let a = 0.2; a <= 0.501; a += 0.1)
      for (let b = 0.2; b <= 0.501; b += 0.1) {
        const c = 1 - a - b;
        if (c >= 0.15 && c <= 0.6) out.push([a, b, c]);
      }
  } else {
    // even, plus tilts toward the bottom and toward the top
    const even = 1 / k;
    out.push(Array(k).fill(even));
    for (const tilt of [0.4, 0.2, -0.2, -0.4]) {
      const sh = Array.from({ length: k }, (_, i) =>
        even * (1 + tilt * (1 - (2 * i) / (k - 1))));
      const sum = sh.reduce((a, b) => a + b, 0);
      out.push(sh.map((x) => x / sum));
    }
  }
  return out.filter((sh) => sh.length === k && sh.every((x) => x > 0.05));
}

function solveGroup({ dv, payload, engines, tanks, unlocked, excluded, needGimbal, maxAspect = Infinity, expansions = null, asparagus = false, g, kind, boosters, srbs, minK, maxK, bodyName, objective = "mass" }) {
  /* Bottom stage carries the full TWR requirement. Upper stages are already
     moving and climbing, so they get a lower floor — but not on a coast burn,
     where thrust barely matters. */
  const pSurf = (kind !== "space" && bodyName && BODY[bodyName])
    ? atmoFor(bodyName).p(0) / 101.325 : 0;
  /* Thick air punishes thrust: drag goes as v², so climbing hard low down on
     Eve costs more than the gravity loss it saves. */
  const twrBottom = kind === "launch" ? 1.25 : kind === "land" ? (pSurf > 1 ? 1.35 : 1.6) : 0.5;
  const twrUpper  = kind === "launch" ? 0.8  : kind === "land" ? 1.1 : 0.5;
  let best = null;
  const byK = [];

  for (let k = minK; k <= maxK; k++) {
    for (const shares of splitShares(k)) {
    /* The per-stage score is only a heuristic for picking within a stage; the
       chain is judged on the real measure. A greedy pass that takes the cheapest
       stage every time can miss the cheapest rocket, which is how a fewest-parts
       design ended up costing less than a cost-optimised one. So build the chain
       under each heuristic and keep whichever comes out best on the objective
       actually asked for. */
    /* A stage that scores better on its own can still make the chain worse, and
       liquid radial columns are heavy enough to do it. Rather than trust the
       coupling term, build the chain both with and without them and keep whichever
       is genuinely better on the objective asked for. */
    /* Three ways to build the same split: everything available, without liquid
       radial columns, and without engine plates. Both of those can score better
       as a stage while making the stack worse, and the chain comparison is the
       only thing that actually knows. */
    /* Trying every build variant on every split triples the solve for a gain that
       only shows up on cost, where the coupling heuristic is weakest. Mass and
       parts rank stages closely enough to their chain effect that one pass is
       enough. */
    /* Build variants. Each removes one option that can score well as a single
       stage while making the whole stack worse, and the chain comparison decides
       — the only thing that actually knows.

       Variant 3 caps clusters at four. Measured over 54 configurations, allowing
       larger ones is right sometimes (a 4.1 t lift is 14% lighter with a cluster
       of five) and badly wrong others (a 12 t lift is 19% dearer). Since it cuts
       both ways it cannot be settled with a fixed limit, only by building it both
       ways and keeping what wins. */
    for (const variant of (objective === "cost" ? [0, 1, 2, 3] : [0, 3])) {
    for (const pick of (objective === "cost" ? ["cost", "parts"] : [objective])) {
      const chain = new Array(k), sub = [];
      let carried = payload, ok = true;
      for (let i = k - 1; i >= 0; i--) {                 // solve top down
        const bottom = i === 0;
        const sdv = dv * shares[i];
        const twrMin = bottom ? twrBottom : twrUpper;
        const pRef = pSurf * STAGE_PRESSURE[Math.min(i, 3)];
        const pSt  = bottom ? pSurf : pRef;              // it lights where it sits
        const extra = 0;   // decouplers and adapters are costed as real parts now
        /* What sits directly above this stage. The chain is pre-sized and filled
           from the top down, so index i+1 is already solved when i is reached —
           chain.length would just be k and always point at the topmost stage. */
        const above = i + 1 < k ? chain[i + 1] : null;
        const plateAbove = !!(above && above.sol && above.sol.coupler && above.sol.coupler.plate);
        let s = solveStage({ dv: sdv, payload: carried, engines, tanks, unlocked, excluded, needGimbal, twrMin, g,
          hasStageBelow: !bottom, noPlate: variant === 2, expansions, plateAbove,
          capCluster: variant === 3 ? 4 : 0,
          pRef, pSurf: pSt, extra, maxBurn: pSurf > 0.5 && bottom ? 200 : 420, objective: pick });
        /* Radial boosters are worth trying on any stage that climbs out of air,
           not just the pad. On Eve they beat a liquid core outright: at three
           atmospheres a Terrier produces nothing at all while a Kickback holds
           144 s. (The 43 s I had assumed for the Terrier came from a synthesised
           curve; its real cutoff is 3 atm.) */
        /* Only where the stage actually lights in meaningful air. On Kerbin an
           upper stage ignites near vacuum, and strapping solids to it was both
           odd and a waste of mass; on Eve the second stage is still in a quarter
           of an atmosphere and boosters genuinely help there. */
          /* Boosters only make sense where there is air to climb out of, but
             drop tanks are not boosters — they add no thrust and their whole
             value is shedding empty tankage, which pays just as well in vacuum.
             In fact it pays better: up here the thrust floor is 0.8 rather than
             1.25, and it was that floor rejecting almost every drop-tank
             configuration on the pad. */
        const wantMounts = boosters && (kind === "launch" || kind === "land")
          && (srbs.length ? pSt > 0.1 : false);
        if (wantMounts || (asparagus && (kind === "launch" || kind === "land"))) {
          const bs = boostedAscent({ dv: sdv, payload: carried, engines, tanks, unlocked, excluded,
            needGimbal, twrMin, g, extra, srbs, pRef, pSurf: pSt, objective: pick,
            noLiquid: variant === 1, noPlate: variant === 2, expansions, asparagus });
          if (bs && (!s || bs.score < s.score)) s = bs;
        }
        if (!s) { ok = false; break; }
        chain[i] = { sol: s, want: sdv, payloadIn: carried, twrMin, g };
        sub.push(s);
        carried = s.total;
      }
      if (!ok) continue;
      /* Compare whole chains on the chosen measure, not just the final mass —
         otherwise splitting a segment always looks free in cost or part terms. */
      const chainScore = objective === "mass" ? carried
        : sub.reduce((a, x) => a + (objective === "cost" ? x.cost : x.parts), 0);
      /* Slenderness is a property of the whole stack, so it can only be judged
         once the chain is complete. Chains inside the limit always beat chains
         outside it, whatever they score — a pencil that is 10% lighter is not a
         better rocket. If nothing fits, the best of the rest still comes back
         rather than leaving you with no design at all. */
      /* Packing pass. It can only be judged once the chain is complete, because
         whether a stage may widen depends on everything beneath it — and stages
         are solved top-down, so that is not known while they are being built.
         Nothing about the propellant changes, so applying it afterwards is safe:
         it trades height for width and adds a few kilograms of brackets. */
      for (let q = chain.length - 1; q >= 0; q--) {
        const sol = chain[q].sol;
        if (!sol) continue;
        const roomBelow = q === 0 ? Infinity
          : Math.max(...chain.slice(0, q).map((x) => stageSize(x.sol).width));
        /* Whether the base may widen depends on whether this group lifts off into
           air. pSurf is the pressure where the bottom stage lights. */
        const pk = packFor(sol, roomBelow, pSurf <= 0.05);
        if (!pk) continue;
        /* Copy before packing. A stage solution is shared between the candidate
           chains that contain it, so writing the packing onto it leaked one
           chain's geometry into another — and the "already packed" guard then
           skipped re-checking it against different room below, which is how three
           stages ended up wider than the stage they sat on. */
        const packedSol = { ...sol, packed: pk,
          dry: sol.dry + pk.mass, total: sol.total + pk.mass };
        chain[q] = { ...chain[q], sol: packedSol };
      }
      const ar = stackGeometry(chain, payload).ar;
      TALLY.chains++;
      const cand = { chain, total: carried, k, chainScore, ar, slim: ar <= maxAspect };
      const better = (x, y) => !y || (x.slim !== y.slim ? x.slim : x.chainScore < y.chainScore);
      if (better(cand, best)) best = cand;
      if (better(cand, byK[k])) byK[k] = cand;
    }
    }
    }
  }
  return best && { ...best, byK: byK.filter(Boolean) };
}

/* Which parts each node actually unlocks. 27 of the 63 stock nodes carry nothing
   that can appear in a rocket — science, comms, robotics — so they are shown
   greyed rather than offered as though they mattered. */
const NODE_PARTS = (() => {
  const m = {};
  const add = (n, name, kind) => { if (!n) return; (m[n] = m[n] || []).push({ name, kind }); };
  DATA.engines.forEach((e) => add(e.t, e.n, e.fuelM > 0 ? "booster" : "engine"));
  DATA.tanks.forEach((t) => add(t.t, t.n, "tank"));
  Object.entries(STRUCT).forEach(([kind, list]) => list.forEach((x) => add(x.t, x.n, kind)));
  /* Couplers were missing entirely, so nodes that unlock an engine plate or a
     bi-coupler looked emptier than they are — Specialized Construction showed
     only the stack separator. They are listed once each, since the same part
     appears in the table for every outlet count it offers. */
  const seenCoup = new Set();
  COUPLERS.forEach((c) => {
    if (seenCoup.has(c.n)) return;
    seenCoup.add(c.n);
    add(c.t, c.n, "coupler");
  });

  Object.values(m).forEach((v) => v.sort((a, b) => a.kind.localeCompare(b.kind)
    || a.name.localeCompare(b.name)));
  return m;
})();

/* ------------------------------ tech tree gating ------------------------------ */
const TIERS = (() => {
  const t = {};
  Object.entries(DATA.nodes).forEach(([name, v]) => { (t[v.lvl] ||= []).push(name); });
  Object.values(t).forEach((a) => a.sort());
  return t;
})();

function withDeps(nodes, set) {
  const out = new Set(set);
  let changed = true;
  while (changed) {
    changed = false;
    out.forEach((n) => (nodes[n]?.deps || []).forEach((d) => {
      if (!out.has(d)) { out.add(d); changed = true; }
    }));
  }
  out.add("Start");
  return out;
}

/* Stock atmospheres exported from Kopernicus kittopia-dumps (KittopiaTech dump of
   the stock system). Keys are [altitude_m, value, inTangent, outTangent] Hermite
   splines, exactly as the game stores them. */
const BODY = {
  Kerbin: { R:600000, g0:9.8100, rot:21549.4, top:70000, M:0.028964400,
    P:[[0.0,101.325,0.0,-0.01501631],[1241.025,84.02916,-0.01289846,-0.01289826],[2439.593,69.68138,-0.01107876,-0.01107859],[3597.11,57.78001,-0.009515483,-0.009515338],[4714.942,47.90862,-0.00817254,-0.008172415],[5794.409,39.72148,-0.00701892,-0.007018813],[6836.791,32.93169,-0.006027969,-0.006027877],[7843.328,27.30109,-0.005176778,-0.0051767],[8815.22,22.63206,-0.004445662,-0.004445578],[10786.42,15.3684,-0.003016528,-0.00301646],[12101.4,11.87313,-0.002329273,-0.00232922],[13417.05,9.172798,-0.001798594,-0.001798554],[16678.47,4.842261,-0.0009448537,-0.0009448319],[21143.1,2.050097,-0.0003894095,-0.0003894005],[26977.92,0.6905929,-0.0001252565,-0.0001252534],[33593.82,0.2201734,-3.62688e-05,-3.62679e-05],[42081.87,0.05768469,-9.0632e-06,-9.063e-06],[49312.13,0.01753794,-3.0294e-06,-3.0293e-06],[56669.95,0.004591824,-8.8272e-07,-8.8270e-07],[62300.84,0.001497072,-3.0771e-07,-3.0770e-07],[70000.0,0.0,0.0,0.0]],
    T:[[0.0,288.15,0.0,-0.008125],[8815.22,216.65,-0.008096968,0.0],[16050.39,216.65,0.0,0.001242164],[25729.23,228.65,0.001237475,0.003464929],[37879.44,270.65,0.00344855,0.0],[41129.24,270.65,0.0,-0.003444189],[57440.13,214.65,-0.003422425,-0.002444589],[68797.88,186.946,-0.002433851,0.0],[70000.0,186.946,0.0,0.0]] },
  Eve: { R:700000, g0:16.6770, rot:80500.0, top:90000, M:0.043000001,
    P:[[0.0,506.625,0.0,-0.04423852],[15000.0,95.6891,-0.01304926,-0.01304926],[25000.0,18.07334,-0.003012223,-0.003012223],[40000.0,3.5,-0.0005689354,-0.0005689354],[50000.0,0.1217772,-2.02962e-05,-2.02962e-05],[60000.0,0.02300074,-3.8335e-06,-3.8335e-06],[70000.0,0.004344278,-7.2400e-07,-7.2400e-07],[80000.0,0.0008205283,-1.3680e-07,-1.3680e-07],[90000.0,0.0,-2.5800e-08,0.0]],
    T:[[0.0,420.0,0.0,-0.01029338],[15000.0,280.0,-0.004705439,-0.004705439],[50000.0,180.0,0.0,0.0],[60000.0,190.0,0.0,0.0],[70000.0,160.0,0.0,0.0],[90000.0,250.0,0.005894589,0.0]] },
  Duna: { R:320000, g0:2.9430, rot:65517.9, top:50000, M:0.043000001,
    P:[[0.0,6.755,0.0,-0.0007],[12000.0,1.276,-0.000223,-0.000223],[20000.0,0.241,-4.22e-05,-4.22e-05],[35000.0,0.015,-2.7871e-06,-2.7871e-06],[50000.0,0.0,0.0,0.0]],
    T:[[0.0,233.0,0.0,-0.0004261126],[1000.0,232.8,-0.000573325,-0.000573325],[25000.0,153.7,-0.001877083,-0.001877083],[30000.0,150.0,0.0,0.0],[45000.0,150.0,0.0,0.0],[50000.0,160.0,0.003746914,0.0]] },
  Laythe: { R:500000, g0:7.8480, rot:52980.9, top:50000, M:0.028964400,
    P:[[0.0,60.795,0.0,-0.005216384],[5250.0,33.40898,-0.004252711,-0.004252711],[10000.0,17.78605,-0.002407767,-0.002407767],[17000.0,7.100577,-0.001092064,-0.001092064],[22000.0,3.812421,-0.0004677011,-0.0004677011],[31000.0,1.312482,-0.0001961767,-0.0001961767],[38000.0,0.5104055,-7.85581e-05,-7.85581e-05],[50000.0,0.0,0.0,0.0]],
    T:[[0.0,277.0,0.0,-0.009285714],[5250.0,206.0,-0.009253677,0.0],[10000.0,206.0,0.0,0.001419616],[17000.0,217.8,0.001414257,0.003959919],[22000.0,235.5,0.0039412,-0.0002581542],[31000.0,203.0,-0.003911343,-0.0007623209],[38000.0,199.0,0.0,0.001478429],[50000.0,214.0,0.0,0.0]] },
};

/* ---------- Hermite / FloatCurve ---------- */
function evalCurve(keys, x) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n-1][0]) return keys[n-1][1];
  let i = 0; while (i < n-2 && x > keys[i+1][0]) i++;
  const [x0,y0,,m0] = keys[i], [x1,y1,m1] = [keys[i+1][0], keys[i+1][1], keys[i+1][2]];
  const h = x1-x0, t = (x-x0)/h, t2=t*t, t3=t2*t;
  return (2*t3-3*t2+1)*y0 + (t3-2*t2+t)*h*m0 + (-2*t3+3*t2)*y1 + (t3-t2)*h*m1;
}
const Rgas = 8.31446;

/* Precomputed atmosphere: pressure (kPa), density (kg/m3), speed of sound (m/s) */
function makeAtmo(b) {
  const step = 20, n = Math.ceil(b.top/step)+2;
  const P = new Float64Array(n), D = new Float64Array(n), A = new Float64Array(n);
  for (let i=0;i<n;i++){
    const h = i*step;
    const p = h >= b.top ? 0 : Math.max(0, evalCurve(b.P, h));
    const T = Math.max(1, evalCurve(b.T, Math.min(h, b.top)));
    P[i]=p; D[i]= p*1000*b.M/(Rgas*T); A[i]= Math.sqrt(1.4*Rgas*T/b.M);
  }
  const get=(arr,h)=>{ if(h<=0)return arr[0]; if(h>=b.top)return 0; const f=h/step,i=f|0; return arr[i]+(arr[i+1]-arr[i])*(f-i); };
  return { p:(h)=>get(P,h), rho:(h)=>get(D,h), a:(h)=>Math.max(1,get(A,Math.min(h,b.top-1))) , P0:P[0] };
}

/* ---------- engine Isp curve ----------
   KSP stores atmosphereCurve as key=<atm> <Isp>; with the value-only form the
   tangents are zero, giving an ease-in/out spline rather than a straight line.
   Third key is the pressure at which the engine quits (3-12 atm in stock).  */
function ispCurve(ispVac, ispAsl, cutoff = 6) {
  const k = [[0, ispVac, 0, 0], [1, ispAsl, 0, 0], [cutoff, 0.001, 0, 0]];
  return (patm) => Math.max(0, evalCurve(k, patm));
}

/* ---------- drag ----------
   KSP bakes six drag cubes per part and occludes faces between attached parts.
   A clean serial stack behaves close to a single body of the widest attached
   diameter, so we take the max cross-section of everything not yet staged away
   and add radial boosters, which are never occluded. Cd follows the stock
   transonic hump. */
/* ---------------------------- drag, as KSP does it ----------------------------
   From Physics.cfg. A face's drag cube Cd is mapped through DRAG_CD, raised to
   DRAG_CD_POWER(mach), scaled by DRAG_TIP(mach) for the face meeting the
   airflow, then by DRAG_MULTIPLIER(mach) and DRAG_PSEUDOREYNOLDS(density x
   speed), and finally by the two global constants. Faces behind the leading one
   go through DRAG_SURFACE instead, which is 0.02 or less — negligible, so only
   the frontal area is counted.

   This replaced a hand-calibrated curve that ran about a third of the real value
   transonic. Cube Cd itself comes from PartDatabase: 0.85 for a cylindrical tank
   face, 0.94 for a booster. */
const DRAG_TIP = [[0.0, 1.0, 0.0, 0.0], [0.85, 1.19, 0.6960422, 0.6960422], [1.1, 2.83, 0.730473, 0.730473], [5.0, 4.0, 0.0, 0.0]];
const DRAG_MULT = [[0.0, 0.5, 0.0, 0.0], [0.85, 0.5, 0.0, 0.0], [1.1, 1.3, 0.0, -0.00810022], [2.0, 0.7, -0.1104858, -0.1104858], [5.0, 0.6, 0.0, 0.0], [10.0, 0.85, 0.02198264, 0.02198264], [14.0, 0.9, 0.00769495, 0.00769495], [25.0, 0.95, 0.0, 0.0]];
const DRAG_CD = [[0.05, 0.0025, 0.15, 0.15], [0.4, 0.15, 0.3963967, 0.3963967], [0.7, 0.35, 0.9066986, 0.9066986], [0.75, 0.45, 3.213604, 3.213604], [0.8, 0.66, 3.49833, 3.49833], [0.85, 0.8, 2.212924, 2.212924], [0.9, 0.89, 1.1, 1.1], [1.0, 1.0, 1.0, 1.0]];
const DRAG_CD_POWER = [[0.0, 1.0, 0.0, 0.00715953], [0.85, 1.25, 0.7780356, 0.7780356], [1.1, 2.5, 0.2492796, 0.2492796], [5.0, 3.0, 0.0, 0.0]];
const DRAG_REYNOLDS = [[0.0, 4.0, 0.0, -2975.412], [0.0001, 3.0, -251.1479, -251.1479], [0.01, 2.0, -19.63584, -19.63584], [0.1, 1.2, -0.7846036, -0.7846036], [1.0, 1.0, 0.0, 0.0], [100.0, 1.0, 0.0, 0.0], [200.0, 0.82, 0.0, 0.0], [500.0, 0.86, 0.00019321, 0.00019321], [1000.0, 0.9, 1.543e-05, 1.543e-05], [10000.0, 0.95, 0.0, 0.0]];
const DRAG_GLOBAL = 8.0 * 0.1;
const CUBE_CD_STACK = 0.85;      // a cylindrical tank face, from PartDatabase

/* Only the leading face counts: everything behind it is occluded and goes
   through DRAG_SURFACE, which tops out at 0.02. Radial boosters sit outside the
   core's shadow, so they add their own. */
function frontalArea(stages, iStage, boostersOn, payloadArea = 0, boostersLeft = null) {
  /* The payload counts. On a small rocket it is often the widest thing aboard —
     a 1.25 m probe on 0.625 m tanks presents four times the tankage's area — and
     leaving it out understated drag badly on exactly the builds where drag hurts
     most. */
  let A = payloadArea;
  for (let i = iStage; i < stages.length; i++) A = Math.max(A, stages[i].area);
  const b = stages[iStage] && stages[iStage].boosters;
  /* Count the stacks that are actually still bolted on. Under asparagus the ring
     thins out as pairs go, and the drag has to thin with it — crediting the mass
     saving while still paying the full ring's drag would be worse than modelling
     neither. */
  if (b && boostersOn) A += (boostersLeft == null ? b.n : boostersLeft) * b.area * 0.85;
  return A;
}

function cdOf(mach, rhoV = 100, cubeCd = CUBE_CD_STACK) {
  const base = Math.pow(evalCurve(DRAG_CD, cubeCd), evalCurve(DRAG_CD_POWER, mach));
  return base * evalCurve(DRAG_TIP, mach) * evalCurve(DRAG_MULT, mach)
    * evalCurve(DRAG_REYNOLDS, rhoV) * DRAG_GLOBAL;
}

/* ---------- ascent integration ---------- */
function flyAscent(veh, opt) {
  TALLY.flights++;
  const b = veh.body, atmo = veh.atmo, mu = b.g0*b.R*b.R, w = 2*Math.PI/b.rot;
  const targetR = b.R + opt.target;
  let pos=[b.R,0], vel=[0,w*b.R];
  let iS=0, prop=veh.stages[0].prop, bProp = veh.stages[0].boosters ? veh.stages[0].boosters.n*veh.stages[0].boosters.prop : 0;
  /* How many side stacks are still attached. Under parallel staging this only
     ever goes from n to zero; under asparagus it steps down two at a time. */
  let bLeft = veh.stages[0].boosters ? veh.stages[0].boosters.n : 0;
  let mass = veh.stages.reduce((s,x)=>s+x.wet+(x.boosters?x.boosters.n*x.boosters.wet:0),0)+veh.payload;
  let kicked=false, coasting=false, handT=-1, handV=0, handAlt=0, t=0, dvUsed=0, gLoss=0, dLoss=0, sLoss=0, maxQ=0, maxQalt=0, maxMach=0;
  const dt=0.1;
  /* Waypoints every 10 km. A flight card that only gives the opening pitch and a
     circularisation figure gives you no way to tell mid-ascent that you have
     drifted off the profile — and the profile is unforgiving, because arriving at
     apoapsis a few hundred m/s slow turns a 125 m/s circularisation into well
     over a thousand. */
  const trace = opt.trace ? [] : null;
  const marks = []; let tMeco = null;

  for (; t<900; t+=dt) {
    const r = Math.hypot(pos[0],pos[1]), h = r-b.R;
    if (h < -50) return { fail:"crashed", t };
    const up=[pos[0]/r,pos[1]/r], east=[-up[1],up[0]];
    const vAtm=[-w*pos[1], w*pos[0]];
    const vr=[vel[0]-vAtm[0], vel[1]-vAtm[1]], sr=Math.hypot(vr[0],vr[1]);

    if (!kicked && sr>=opt.vKick) kicked=true;
    let pitch=0;
    if (kicked) {
      const pro=Math.atan2(vr[0]*east[0]+vr[1]*east[1], vr[0]*up[0]+vr[1]*up[1]);
      /* Hold the kick attitude until the velocity vector rotates up to meet it;
         from that moment on, prograde leads and the turn flies itself. That
         crossover is the handoff the pilot needs told to them. */
      if (handT < 0 && pro >= opt.kick) { handT = t; handV = sr; handAlt = h; }
      /* Never below the horizon on the way up. Following prograde without a floor
         lets a shallow stage nose down, descend, and drive its periapsis into the
         ground while its osculating apoapsis still reads high. */
      pitch = Math.min(Math.PI / 2, Math.max(pro, opt.kick));
    }
    const dir=[Math.cos(pitch)*up[0]+Math.sin(pitch)*east[0], Math.cos(pitch)*up[1]+Math.sin(pitch)*east[1]];

    const st=veh.stages[iS];
    /* KSP's thrust limiter scales mass flow as well as thrust, so the stage simply
       burns longer at lower thrust. Applied to the boosters when there are any —
       that is the slider people actually reach for — otherwise to the core. */
    const lim = (iS === 0 ? (opt.limit === undefined ? 1 : opt.limit) : 1);
    const bLim = (st && st.boosters) ? lim : 1;
    /* A separate throttle for the liquid core. With strap-on solids you cannot
       shut the boosters down, so the way to stop the apoapsis running away is to
       throttle the core until the two finish together — which is what a pilot
       does by hand and what the old model had no way to express. */
    const cLim = (st && st.boosters)
      ? (iS === 0 && opt.core !== undefined ? opt.core : 1)
      : lim;
    const pa = atmo.p(h)/101.325;   // absolute atmospheres — the Isp curve is keyed on Kerbin sea level, not local surface
    let T=0, mdot=0;
    if (st && prop>0 && !coasting) { const isp=st.isp(pa); T += st.mdot*cLim*isp*9.80665; mdot += st.mdot*cLim; }
    /* Solids keep burning through cutoff — there is no shutdown valve on an SRB.
       Modelling them as stoppable let the simulator report an apoapsis it could
       not actually stop at, and the flight card told you to cut engines while the
       boosters were still pushing. */
    if (st && st.boosters && bProp>0) { const bo=st.boosters, isp=bo.isp(pa);
      T += bLeft*bo.mdot*bLim*isp*9.80665; mdot += bLeft*bo.mdot*bLim; }

    // apoapsis check -> shut down
    const vv=Math.hypot(vel[0],vel[1]), en=vv*vv/2-mu/r, hm=pos[0]*vel[1]-pos[1]*vel[0];
    const a=-mu/(2*en), e=Math.sqrt(Math.max(0,1+2*en*hm*hm/(mu*mu))), apo=a*(1+e);
    const climbing = (pos[0]*vel[0]+pos[1]*vel[1]) > 0;
    /* Cut off only while still rising. The apoapsis of the osculating orbit can
       read above target while the vehicle is descending toward a periapsis below
       the surface — that apoapsis is behind it on the ellipse and unreachable, so
       shutting down there means falling, not coasting. */
    /* Cutting the core while solids still burn does not end the burn, so hold the
       cutoff until they are spent — and record how far past target the apoapsis
       is carried in the meantime. */
    if (!coasting && apo>=targetR && climbing && bProp<=0) {
      coasting = true;
      // the engine stops here — record it, rather than labelling the point where
      // the integration happens to hand over to the ballistic coast
      marks.push({ t: Math.round(t), h: Math.round(h), v: Math.round(sr),
        nav: Math.round(90 - pitch * 180 / Math.PI), meco: true });
      tMeco = t;
    }
    if (coasting) {
      /* Reaching the top of the arc is not the same as reaching orbit. Cutoff is
         armed when the osculating apoapsis first reads above target, but the
         vehicle can then run dry, or lose apoapsis to drag, and arrive at a peak
         well below where it was aimed. Circularising there does not produce the
         requested orbit — it produces a lower one — so the flight has to be
         reported as short rather than as a success.

         This is what let a launch cut off at 51 km with 2 165 m/s (circular there
         is 2 329) and still return ok, with a 28-minute "coast" upward from what
         was already its apoapsis. */
      /* Arriving at the top of the arc below the target orbit is not success.
         Cutoff is armed the moment the osculating apoapsis first reads above
         target, but drag keeps eating it during the climb out of the atmosphere,
         so the peak actually reached can be kilometres lower. Circularising there
         produces a lower orbit than the one asked for, and the Δv reported is the
         cost of that lower orbit — cheaper, and not the mission.

         The tolerance is 1 km, which is inside what the turn search can resolve
         and well outside integration noise. Loosely checked, this let a launch
         peak at 76.6 km against an 80 km target and score as the cheapest ascent
         available, because falling short is always cheaper than not. */
      /* Two ways out of the coast: reach the top of the arc, or climb clear of
         the air. Either way the orbit is whatever the state says it is, so the
         apoapsis has to be checked on both paths — testing only at the peak let a
         flight that left the atmosphere 3.4 km short sail through and score as
         the cheapest ascent available, because falling short is always cheaper
         than not. */
      if (!climbing || h >= b.top) {                       // at apoapsis, or clear of the air
        if (apo < targetR - 1000)
          return { fail: "apoapsis short", t, apo: apo - b.R, dvUsed };
        const vApo=Math.sqrt(Math.max(0,mu*(2/apo-1/a))), vC=Math.sqrt(mu/apo);
        /* The circularisation is not an impulse. Work out how long it actually
           takes on whatever stage is still live, so the burn can be centred on
           apoapsis rather than started there. */
        const live = veh.stages[iS];
        let circBurn = null, circProp = null, circShort = false, circDv = vC - vApo;
        if (live) {
          /* The circularisation is not an impulse, and on a lofted arrival it is
             nowhere near one: arriving slow means buying almost the whole orbital
             velocity, which on a small upper stage can run for minutes. Over a
             burn that long the vehicle travels a long way round, thrust that
             started horizontal is no longer horizontal, and the impulsive figure
             understates it badly.

             Integrate it instead. Thrust perpendicular to the radius — the
             attitude a pilot actually holds — and stop when the speed reaches
             circular. What that costs above the impulsive figure is the finite
             burn loss, and it is what makes a lofted ascent expensive. */
          let cr = apo, cv = vApo, cm = mass, cp = prop, spent = 0, t2 = 0;
          const dt2 = 0.5, ispV = live.isp(0), ve = ispV * 9.80665;
          for (; t2 < 1200; t2 += dt2) {
            const vCircHere = Math.sqrt(mu / cr);
            if (cv >= vCircHere) break;
            if (cp <= 0) { circShort = true; break; }
            const acc = live.mdot * ve / cm;
            const dv2 = acc * dt2;
            /* Only the component that is still adding orbital speed counts; the
               radial component fights the climb the burn itself induces. */
            cv += dv2;
            const excess = cv * cv / cr - mu / (cr * cr);   // net outward accel
            cr += Math.max(0, excess) * dt2 * dt2 * 0.5 + 0;
            cm -= live.mdot * dt2; cp -= live.mdot * dt2; spent += dv2;
          }
          circDv = spent > 0 ? spent : vC - vApo;
          circProp = mass - cm;
          circBurn = t2;
        }
        /* Above the atmosphere the rest of the climb is a ballistic coast — no
           thrust, no drag — so the remaining waypoints follow from conservation of
           energy rather than more integration. Surface speed subtracts the ground
           rotating underneath. */
        /* Carry the profile through the coast and the circularisation, because
           cutoff is not the end of the job — it is the point at which the pilot
           has the least idea what to do next. Time to apoapsis comes from Kepler:
           true anomaly from the state, then eccentric and mean anomaly, then the
           remaining sweep to apoapsis divided by the mean motion. */
        const eOrb = vv * vv / 2 - mu / r;
        const nu = Math.atan2((pos[0]*vel[0] + pos[1]*vel[1]) / Math.sqrt(mu / (a * (1 - e * e))) * 1,
          (a * (1 - e * e) / r - 1));
        const EA = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
        const M = EA - e * Math.sin(EA);
        const n = Math.sqrt(mu / (a * a * a));
        let toApo = (Math.PI - M) / n;
        if (!isFinite(toApo) || toApo < 0) toApo = 0;

        // a handful of checkpoints, not a 30-second log of a twenty-minute coast
        const step = Math.max(30, Math.round(toApo / 4 / 10) * 10);
        for (let dtc = step; dtc < toApo - step / 2; dtc += step) {
          const frac = dtc / toApo;
          const hc = h + (apo - b.R - h) * Math.sin(frac * Math.PI / 2);   // eases into apoapsis
          const rc = b.R + hc;
          const vc = Math.sqrt(Math.max(0, 2 * (eOrb + mu / rc)));
          marks.push({ t: Math.round(t + dtc), h: Math.round(hc),
            v: Math.round(Math.max(0, vc - w * rc)), coast: true });
        }
        const tApo = Math.round(t + toApo);
        marks.push({ t: tApo, h: Math.round(apo - b.R), v: Math.round(Math.max(0, vApo - w * apo)),
          apoMark: true });
        return { ok:true, marks, tApo, toApo, tMeco, t, dvUsed, circ:circDv, total:dvUsed+circDv, apo:apo-b.R, handT, handV, handAlt,
          vApo, vCirc: vC,
          circBurn, circProp, circShort,
          gLoss, dLoss, sLoss, maxQ, maxQalt, maxMach, propLeft:prop, mass };
      }
    }

    const rho=atmo.rho(h), q=0.5*rho*sr*sr, mach=sr/atmo.a(h);
    if (q>maxQ){maxQ=q;maxQalt=h;} if(mach>maxMach)maxMach=mach;
    /* Keyed on time, not altitude. A low-TWR upper stage flattens out and will
       sit level or even nose-down while it builds horizontal speed, so it can
       pass 40 km, drop back to 38 km and cut off there — altitude is not
       monotonic and a table indexed by it puts the rows in the wrong order.
       `pitch` runs from straight up toward the horizon, so the navball reading —
       degrees above the horizon — is its complement. */
    // powered flight only; the coast gets its own sparse checkpoints below
    if (!coasting && t >= marks.length * 30 && marks.length < 20)
      marks.push({ t: Math.round(t), h: Math.round(h), v: Math.round(sr),
        nav: Math.round(90 - pitch * 180 / Math.PI) });
    const A=frontalArea(veh.stages,iS,bProp>0,veh.payloadArea||0,bLeft), D=q*cdOf(mach, rho*sr)*A/1000;  // N -> kN, masses are tonnes
    const g=mu/(r*r);

    const acc=[ dir[0]*T/mass - up[0]*g - (sr>0?vr[0]/sr:0)*D/mass,
                dir[1]*T/mass - up[1]*g - (sr>0?vr[1]/sr:0)*D/mass ];
    // loss accounting
    /* Losses are what the ENGINE has to overcome, so they only accrue while it is
       running. Accumulating gravity loss through the coast added a phantom
       1 200 m/s to a five-minute ascent with a nine-minute coast — the vehicle is
       still climbing and gravity is still slowing it, but no propellant is being
       spent to fight it. That is the coast trading speed for altitude, which the
       orbit already accounts for.

       Drag during the coast is real and still costs velocity, so it stays. */
    if (sr>0){ const vh=[vr[0]/sr,vr[1]/sr];
      if (!coasting) gLoss += g*(vh[0]*up[0]+vh[1]*up[1])*dt;
      dLoss += D/mass*dt;
      if (!coasting) sLoss += T/mass*(1-(dir[0]*vh[0]+dir[1]*vh[1]))*dt; }
    dvUsed += T/mass*dt;

    if(trace && Math.abs(t%10)<dt/2) trace.push({t:+t.toFixed(0),h:+(h/1000).toFixed(1),sr:+sr.toFixed(0),pitch:+(pitch*57.3).toFixed(1),apo:+((apo-b.R)/1000).toFixed(1),m:+mass.toFixed(1),T:+T.toFixed(0),q:+(q/1000).toFixed(1)});
    vel=[vel[0]+acc[0]*dt, vel[1]+acc[1]*dt];
    pos=[pos[0]+vel[0]*dt, pos[1]+vel[1]*dt];
    mass -= mdot*dt;
    if (st) { if (st.boosters && bProp>0){ const bo=st.boosters;
        /* Every attached engine draws from the pool, so it drains faster the
           more stacks are still burning — that is the point of the arrangement,
           and it is why a pair empties long before it would on its own. */
        const u=bLeft*bo.mdot*bLim*dt; bProp-=u;
        if (bo.asparagus && bLeft > 2) {
          /* Shed a pair each time one pair's worth has gone. */
          const spent = bo.n*bo.prop - bProp;
          const shed = Math.min(Math.floor(spent / bo.pairProp) * 2, bo.n - 2);
          const want = bo.n - shed;
          while (bLeft > want) { mass -= bo.pairDry; bLeft -= 2; }
        }
        if (bProp<=0){ mass -= bLeft*bo.dry; bProp=0; bLeft=0; } }
      if (!coasting) prop -= st.mdot*cLim*dt;
      if (prop<=0){ mass -= st.dry; iS++; if(iS>=veh.stages.length) return {fail:"out of fuel", t, apo:apo-b.R, dvUsed, trace};
        prop=veh.stages[iS].prop;
        bProp=veh.stages[iS].boosters?veh.stages[iS].boosters.n*veh.stages[iS].boosters.prop:0;
        bLeft=veh.stages[iS].boosters?veh.stages[iS].boosters.n:0; } }
  }
  return { fail:"timeout" };
}

/* Search the turn. Unconstrained, the optimum is a violent early pitchover that
   trades gravity loss for dynamic pressure the vehicle could never survive or
   hold prograde through, so cap max Q at a level people actually fly.
   Coarse pass then a local refine — a full fine grid is ~550 trajectories and
   costs most of a second, which is too slow to sit inside a live recompute. */
function optimiseTurn(veh, target = 80000, qCap = 40000) {
  let best = null, gentlest = null;
  const scan = (vs, ks) => {
    for (const vK of vs) for (const kd of ks) {
      const r = flyAscent(veh, { target, vKick: vK, kick: kd * Math.PI / 180 });
      if (!r.ok) continue;
      const c = { ...r, vKick: vK, kick: kd };
      /* If nothing meets the q cap, fall back to the calmest trajectory, not the
         cheapest — the cheapest is the most aggressive, which is the opposite of
         what you want when the vehicle is already fighting the air. */
      if (!gentlest || r.maxQ < gentlest.maxQ) gentlest = c;
      if (r.maxQ <= qCap && (!best || r.total < best.total)) best = c;
    }
  };
  const range = (a, b, st) => { const o = []; for (let x = a; x <= b; x += st) o.push(x); return o; };
  scan(range(30, 140, 20), range(3, 25, 4));
  /* If nothing stays under the cap at full thrust, look for a limiter setting that
     does. Not a binary search from zero: throttle far enough back and the stack
     cannot leave the pad, so the workable range is an interval, not a half-line.
     Scan down from full thrust and take the first setting that both flies and
     stays under — the highest thrust that behaves. */
  if (!best && gentlest) {
    for (let lim = 0.95; lim >= 0.3; lim -= 0.05) {
      const r = flyAscent(veh, { target, vKick: gentlest.vKick,
        kick: gentlest.kick * Math.PI / 180, limit: lim });
      if (r.ok && r.maxQ <= qCap) {
        best = { ...r, vKick: gentlest.vKick, kick: gentlest.kick, limit: lim };
        break;
      }
    }
  }

  const seed = best || gentlest;
  if (seed) scan(range(Math.max(25, seed.vKick - 15), seed.vKick + 15, 5),
                 range(Math.max(2, seed.kick - 3), seed.kick + 3, 1));

  /* With solids aboard, try throttling the core as well. The pairing that lands
     the boosters' burnout near the target apoapsis is usually far better than any
     turn alone, because it stops the stack carrying its apoapsis past the mark
     with thrust it cannot switch off. */
  if (veh.stages[0] && veh.stages[0].boosters) {
    const seedTurn = best || gentlest;
    if (seedTurn) for (let cr = 1; cr >= 0.35; cr -= 0.05) {
      const r = flyAscent(veh, { target, vKick: seedTurn.vKick,
        kick: seedTurn.kick * Math.PI / 180, core: cr });
      if (r.ok && r.maxQ <= qCap && (!best || r.total < best.total))
        best = { ...r, vKick: seedTurn.vKick, kick: seedTurn.kick, core: cr,
          fullThrottle: seedTurn.total };      // what it costs without throttling
    }
  }

  return best || gentlest;
}

const _unused = { makeAtmo, ispCurve, BODY, evalCurve };


/* ---------------------- vehicle -> simulator ---------------------- */
/* Stock propellant is 5 kg per 5 litres, so one tonne of it is exactly one cubic
   metre. Tank length follows from that and the diameter with a 15% structural
   allowance, which reproduces every stock tank: 1.875, 3.75 and 7.5 m.
   Aspect ratio is the buildability signal — a tall narrow stack wobbles on the
   pad and flips in the upper atmosphere no matter how good its Δv is. */
/* Enclosing-circle diameter for n packed circles, in units of one engine
   diameter. A cluster of four 1.25 m engines spans 3.02 m, so it sticks out past
   the 2.5 m tank above it and meets the airflow. */
const SPAN = [0, 1, 2, 2.155, 2.414, 2.701, 3, 3, 3.304, 3.613, 3.813];
const clusterSpan = (n, d) => d * (SPAN[n] || 1 + Math.sqrt(n));

const ENGINE_LEN = { "0": 0.9, "1": 1.6, "1.5": 2.0, "2": 2.6, "3": 4.5, "4": 5.0, R: 0 };
const engineLen = (e) => PART_H[e.n] !== undefined ? PART_H[e.n] : ( Math.max(...e.sz.map((z) => (ENGINE_LEN[z] !== undefined ? ENGINE_LEN[z] : 1.6))));

/* One geometry model, shared by the buildability readout and the drag term.
   Frontal area is the tank cross-section or the summed engine cross-sections,
   whichever is larger: engines wider than the tank are exposed on the annulus,
   engines narrower than it sit in its shadow. */
/* Real part heights, measured off the drag cube bounding boxes in PartDatabase.
   The modelled lengths were close for tanks but wrong for boosters — a Kickback
   holds 19.5 t of solid fuel and is genuinely about 15 m long, which no simple
   volume formula was going to land on. Two parts have no cube; they fall back. */
const PART_H = {"24-77 \"Twitch\" Liquid Fuel Engine":0.554,"48-7S \"Spark\" Liquid Fuel Engine":0.449,"BACC \"Thumper\" Solid Fuel Booster":7.865,"CR-7 R.A.P.I.E.R. Engine":4.244,"F3S0 \"Shrimp\" Solid Fuel Booster":3.987,"FM1 \"Mite\" Solid Fuel Booster":1.775,"IX-6315 \"Dawn\" Electric Propulsion System":0.452,"Kerbodyne KR-2L+ \"Rhino\" Liquid Fuel Engine":4.086,"LFB KR-1x2 \"Twin-Boar\" Liquid Fuel Engine":24.52,"LV-1 \"Ant\" Liquid Fuel Engine":0.383,"LV-909 \"Terrier\" Liquid Fuel Engine":0.968,"LV-T30 \"Reliant\" Liquid Fuel Engine":1.959,"LV-T45 \"Swivel\" Liquid Fuel Engine":1.703,"Mk-55 \"Thud\" Liquid Fuel Engine":1.831,"O-10 \"Puff\" MonoPropellant Fuel Engine":1.193,"RE-I5 \"Skipper\" Liquid Fuel Engine":2.531,"RE-L10 \"Poodle\" Liquid Fuel Engine":1.71,"RE-M3 \"Mainsail\" Liquid Fuel Engine":3.123,"RT-10 \"Hammer\" Solid Fuel Booster":2.859,"RT-5 \"Flea\" Solid Fuel Booster":1.775,"S1 SRB-KD25k \"Kickback\" Solid Fuel Booster":14.94,"S2-17 \"Thoroughbred\" Solid Fuel Booster":12.23,"S2-33 \"Clydesdale\" Solid Fuel Booster":22.29,"S3 KS-25 \"Vector\" Liquid Fuel Engine":2.355,"S3 KS-25x4 \"Mammoth\" Liquid Fuel Engine":25.1,"Sepratron I":0.541,"T-1 Toroidal Aerospike \"Dart\" Liquid Fuel Engine":1.095,"Mk-1H 'Torch' Liquid Fuel Engine":0.893,"LV-303 'Pug' Liquid Fuel Engine":0.546,"LV-T15 'Valiant' Liquid Fuel Engine":1.521,"UR-2 'Caravel' Liquid Fuel Engine":2.709,"UR-1 'Galleon' Liquid Fuel Engine":2.877,"UR-137 'Schnauzer' Liquid Fuel Engine":2.138,"RK-107 'Ursa' Liquid Fuel Engine":1.951,"KR-1 'Boar' Liquid Fuel Engine":2.518,"LV-N410 'Cherenkov' Atomic Rocket Motor":7.272,"KR-10A 'Corgi' Liquid Fuel Engine Cluster":3.364,"RK-1 'Trash Panda' Vernier Engine":1.192,"Launch Escape System Jr.":3.703,"TCK-2 'Castor' Solid Rocket Booster":15.73,"FL-S1200 Liquid Fuel Tank":7.354,"2.5m to Mk2 Adapter":3.781,"C7 Brand Adapter - 2.5m to 1.25m":2.563,"FL-R750 RCS Fuel Tank":1.079,"FL-R20 RCS Fuel Tank":0.392,"FL-R120 RCS Fuel Tank":0.588,"FL-T100 Fuel Tank":0.688,"FL-T200 Fuel Tank":1.163,"FL-T400 Fuel Tank":1.953,"FL-T800 Fuel Tank":3.813,"Kerbodyne ADTP-2-3":2.302,"Kerbodyne S3-14400 Tank":7.525,"Kerbodyne S3-3600 Tank":1.972,"Kerbodyne S3-7200 Tank":3.913,"Mk0 Liquid Fuel Fuselage":1.0,"Mk1 Liquid Fuel Fuselage":1.938,"Mk2 Bicoupler":1.906,"Mk2 Liquid Fuel Fuselage":3.75,"Mk2 Liquid Fuel Fuselage Short":1.875,"Mk2 Monopropellant Tank":1.875,"Mk2 Rocket Fuel Fuselage":3.75,"Mk2 Rocket Fuel Fuselage Short":1.875,"Mk2 to 1.25m Adapter":1.906,"Mk2 to 1.25m Adapter Long":3.781,"Mk3 Liquid Fuel Fuselage":5.0,"Mk3 Liquid Fuel Fuselage Long":10.0,"Mk3 Liquid Fuel Fuselage Short":2.5,"Mk3 Monopropellant Tank":1.25,"Mk3 Rocket Fuel Fuselage":5.0,"Mk3 Rocket Fuel Fuselage Long":10.0,"Mk3 Rocket Fuel Fuselage Short":2.5,"Mk3 to 2.5m Adapter":3.781,"Mk3 to 3.75m Adapter":1.906,"Mk3 to Mk2 Adapter":5.0,"NCS Adapter":1.938,"Oscar-B Fuel Tank":0.381,"PB-X150 Xenon Container":0.295,"PB-X50R Xenon Container":0.591,"PB-X750 Xenon Container":0.618,"R-11 'Baguette' External Tank":1.25,"R-12 'Doughnut' External Tank":0.333,"R-4 'Dumpling' External Tank":0.625,"Rockomax Jumbo-64 Fuel Tank":7.54,"Rockomax X200-16 Fuel Tank":1.92,"Rockomax X200-32 Fuel Tank":3.8,"Rockomax X200-8 Fuel Tank":0.99,"Stratus-V Cylindrified Monopropellant Tank":1.472,"Stratus-V Roundified Monopropellant Tank":0.563,"Oscar-O Hemispherical Liquid Fuel Tank":0.328,"Oscar-E Liquid Fuel Tank":2.818,"Oscar-D Liquid Fuel Tank":1.425,"Oscar-C Liquid Fuel Tank":0.732,"Oscar-A Liquid Fuel Tank":0.206,"PRBE-9 Liquid Fuel Tank":0.36,"PRBE-4 Liquid Fuel Tank":0.188,"FL-T50-R Hemispherical Liquid Fuel Tank":0.653,"FL-TX220-R Hemispherical Liquid Fuel Tank":0.977,"FL-X1800 Liquid Fuel Tank":3.833,"FL-X900 Liquid Fuel Tank":1.946,"FL-X440 Liquid Fuel Tank":1.02,"FL-X220 Liquid Fuel Tank":0.551,"FL-XA160-S Fuel Tank Adapter":0.797,"FL-XA600 Fuel Tank Adapter":1.939,"FL-XA160 Fuel Tank Adapter":0.537,"FL-XA1200 Fuel Tank Adapter":1.96,"Rockomax X-200-4R Hemispherical Liquid Fuel Tank":1.276,"Kerbodyne S3-1800 Tank":1.005,"Kerbodyne S3-900R Hemispherical Liquid Fuel Tank":1.492,"Kerbodyne S3-3600 Nosecone":4.454,"Kerbodyne SIV-512K Liquid Fuel Tank":15.05,"Kerbodyne SIV-256K Liquid Fuel Tank":7.554,"Kerbodyne SIV-128K Liquid Fuel Tank":3.804,"Kerbodyne SIV-64K Liquid Fuel Tank":1.929,"Kerbodyne SAIV Liquid Fuel Tank Adapter":2.549,"Kerbodyne SIV Fuelled Engine Adapter":3.181,"TD-06 Decoupler":0.103,"TD-12 Decoupler":0.16,"TD-25 Decoupler":0.32,"TD-37 Decoupler":0.48,"TS-06 Stack Separator":0.103,"TS-12 Stack Separator":0.16,"TS-25 Stack Separator":0.32,"TS-37 Stack Separator":0.48,"Hydraulic Detachment Manifold":1.718,"TT-38K Radial Decoupler":1.264,"TT-70 Radial Decoupler":1.686,"Mk16 Parachute":0.363,"Mk12-R Radial-Mount Drogue Chute":0.42,"Mk16-XL Parachute":0.666,"Mk2-R Radial-Mount Parachute":0.84,"Mk25 Parachute":0.589,"Heat Shield (0.625m)":0.107,"Heat Shield (1.25m)":0.284,"Heat Shield (2.5m)":0.55,"Heat Shield (3.75m)":0.837,"LT-1 Landing Struts":2.243,"LT-2 Landing Strut":3.078,"LT-05 Micro Landing Strut":1.471,"TVR-200 Stack Bi-Coupler":0.763,"TVR-1180C Mk1 Stack Tri-Coupler":1.057,"TVR-2160C Mk2 Stack Quad-Coupler":1.075,"TVR-200L Stack Bi-Adapter":0.852,"TVR-400L Stack Quad-Adapter":0.852,"LV-1R \"Spider\" Liquid Fuel Engine":0.554};
/* Real axial face areas, measured off the same drag cubes as the heights. It
   matters most for radial engines, where inferring an area from diameter is
   badly wrong — diaOf falls back to 1.25 m for anything with no stack profile,
   so a Twitch was being charged 1.23 m² of frontal area against a true 0.07. */
const PART_A = {"24-77 \"Twitch\" Liquid Fuel Engine":0.0661,"48-7S \"Spark\" Liquid Fuel Engine":0.2642,"BACC \"Thumper\" Solid Fuel Booster":1.423,"CR-7 R.A.P.I.E.R. Engine":1.277,"F3S0 \"Shrimp\" Solid Fuel Booster":0.3465,"FM1 \"Mite\" Solid Fuel Booster":0.3465,"IX-6315 \"Dawn\" Electric Propulsion System":0.2486,"Kerbodyne KR-2L+ \"Rhino\" Liquid Fuel Engine":11.07,"LFB KR-1x2 \"Twin-Boar\" Liquid Fuel Engine":5.934,"LV-1 \"Ant\" Liquid Fuel Engine":0.1062,"LV-909 \"Terrier\" Liquid Fuel Engine":1.253,"LV-T30 \"Reliant\" Liquid Fuel Engine":1.2,"LV-T45 \"Swivel\" Liquid Fuel Engine":1.2,"Mk-55 \"Thud\" Liquid Fuel Engine":0.6108,"O-10 \"Puff\" MonoPropellant Fuel Engine":0.2515,"RE-I5 \"Skipper\" Liquid Fuel Engine":4.87,"RE-L10 \"Poodle\" Liquid Fuel Engine":2.899,"RE-M3 \"Mainsail\" Liquid Fuel Engine":4.8,"RT-10 \"Hammer\" Solid Fuel Booster":1.25,"RT-5 \"Flea\" Solid Fuel Booster":1.25,"S1 SRB-KD25k \"Kickback\" Solid Fuel Booster":2.012,"S2-17 \"Thoroughbred\" Solid Fuel Booster":7.075,"S2-33 \"Clydesdale\" Solid Fuel Booster":7.075,"S3 KS-25 \"Vector\" Liquid Fuel Engine":1.2,"S3 KS-25x4 \"Mammoth\" Liquid Fuel Engine":8.383,"Sepratron I":0.0213,"T-1 Toroidal Aerospike \"Dart\" Liquid Fuel Engine":1.213,"Mk-1H 'Torch' Liquid Fuel Engine":0.2423,"KR-1 'Boar' Liquid Fuel Engine":4.87,"LV-N410 'Cherenkov' Atomic Rocket Motor":4.173,"Launch Escape System Jr.":0.3338,"2.5m to Mk2 Adapter":4.865,"C7 Brand Adapter - 2.5m to 1.25m":4.853,"FL-R750 RCS Fuel Tank":4.842,"FL-R20 RCS Fuel Tank":0.3032,"FL-R120 RCS Fuel Tank":1.199,"FL-T100 Fuel Tank":1.213,"FL-T200 Fuel Tank":1.213,"FL-T400 Fuel Tank":1.213,"FL-T800 Fuel Tank":1.213,"Kerbodyne ADTP-2-3":11.0,"Kerbodyne S3-14400 Tank":11.03,"Kerbodyne S3-3600 Tank":10.92,"Kerbodyne S3-7200 Tank":10.92,"Mk0 Liquid Fuel Fuselage":0.3033,"Mk1 Liquid Fuel Fuselage":1.213,"Mk2 Bicoupler":2.92,"Mk2 Liquid Fuel Fuselage":2.494,"Mk2 Liquid Fuel Fuselage Short":2.494,"Mk2 Monopropellant Tank":2.494,"Mk2 Rocket Fuel Fuselage":2.494,"Mk2 Rocket Fuel Fuselage Short":2.494,"Mk2 to 1.25m Adapter":2.494,"Mk2 to 1.25m Adapter Long":2.494,"Mk3 Liquid Fuel Fuselage":10.33,"Mk3 Liquid Fuel Fuselage Long":10.33,"Mk3 Liquid Fuel Fuselage Short":10.33,"Mk3 Monopropellant Tank":10.33,"Mk3 Rocket Fuel Fuselage":10.33,"Mk3 Rocket Fuel Fuselage Long":10.33,"Mk3 Rocket Fuel Fuselage Short":10.33,"Mk3 to 2.5m Adapter":10.33,"Mk3 to 3.75m Adapter":10.92,"Mk3 to Mk2 Adapter":10.33,"NCS Adapter":1.213,"Oscar-B Fuel Tank":0.3033,"PB-X150 Xenon Container":0.3033,"PB-X50R Xenon Container":0.0993,"PB-X750 Xenon Container":1.217,"R-11 'Baguette' External Tank":0.3194,"R-12 'Doughnut' External Tank":0.9252,"R-4 'Dumpling' External Tank":0.3018,"Rockomax Jumbo-64 Fuel Tank":5.069,"Rockomax X200-16 Fuel Tank":4.853,"Rockomax X200-32 Fuel Tank":4.949,"Rockomax X200-8 Fuel Tank":4.853,"Stratus-V Cylindrified Monopropellant Tank":0.3536,"Stratus-V Roundified Monopropellant Tank":0.3536,"Oscar-E Liquid Fuel Tank":0.3069,"Oscar-D Liquid Fuel Tank":0.3033,"Oscar-C Liquid Fuel Tank":0.3033,"Oscar-A Liquid Fuel Tank":0.3033,"PRBE-9 Liquid Fuel Tank":0.1179,"PRBE-4 Liquid Fuel Tank":0.1154,"Kerbodyne S3-1800 Tank":10.92,"Kerbodyne S3-3600 Nosecone":10.93};
const areaOf = (part, fallback) => PART_A[part.n] !== undefined ? PART_A[part.n] : fallback;

/* The width a part actually presents, from its measured face area rather than
   its size class. It matters for anything without a stack profile: diaOf falls
   back to 1.25 m for a radial engine, so a Twitch drew as wide as the tank it
   bolts to when it is really 0.29 m across. */
const widthOf = (part, fallback) => PART_A[part.n] !== undefined
  ? 2 * Math.sqrt(PART_A[part.n] / Math.PI)
  : fallback;

const heightOf = (part, fallback) => PART_H[part.n] !== undefined ? PART_H[part.n] : fallback;
const tankStackLen = (tk) => tk
  ? tk.list.reduce((a, x) => a + x.c * heightOf(x.t,
      1.15 * x.t.prop / (Math.PI / 4 * Math.pow(diaOf(x.t), 2))), 0)
  : 0;

/* One definition of the stack's proportions, used by the summary, the drawing
   and the solver's slenderness limit alike. They disagreed before: the summary
   measured stages only, the drawing added the payload and the booster ring, and
   the constraint used a third variant — so a design could be drawn at 13:1,
   reported at 11:1, and pass a 12:1 limit. */
function stackGeometry(chain, payload) {
  let h = 0, w = 0;
  chain.forEach((x) => {
    const sol = x && x.sol ? x.sol : x;
    if (!sol || !sol.engine) return;
    const g = stageSize(sol);
    h += g.len; w = Math.max(w, g.coreWidth);   // boosters excluded: they stage away
  });
  const payD = Math.max(0.9, Math.cbrt(Math.max(payload, 0.1)) * 1.1);
  h += payD * 1.3;
  w = Math.max(w, payD);
  return { h, w, payD, ar: w ? h / w : 0 };
}

/* Tank packing. A run of identical tanks does not have to be a single tall
   column: four of them can ring a fifth, turning five tanks tall into one tank
   tall at three times the width. Nothing about the propellant changes, so this
   is purely a way to trade height for width — which is worth doing exactly when
   the slenderness limit is binding and there is width to spare.

   Width to spare is the whole question. Frontal area is a max over the stack, so
   widening a stage costs nothing as long as it stays inside the widest thing
   below it, and costs a great deal the moment it does not. Measured across a
   range of builds, 33 of 38 stages with three or more stacked tanks had room.

   Holding it together: a radial column needs one crossfeed path and one anchor.
   A TT-38K with crossfeed switched on is 25 kg and does both jobs in one part,
   against 51 kg for a strut plus a fuel duct. A cubic strut at the far end stops
   the column pivoting. */
const PACK_JOIN = { n: "TT-38K Radial Decoupler (crossfeed on)", m: 0.025, cost: 600 };
const PACK_BRACE = { n: "Cubic Octagonal Strut", m: 0.001, cost: 16 };

/* KSP's symmetry tool offers 2, 3, 4, 6 and 8-fold, so a ring has to be one of
   those to be placeable in one action. A packed block is L levels of a centre
   column with r tanks around each level, so it consumes exactly L × (r + 1)
   tanks — and only identical ones, since a ring of mismatched tanks is neither
   symmetric nor buildable.

   That gives a table rather than a formula:
     3 -> 2 around 1        6 -> 2 around 1, two levels
     4 -> 3 around 1        8 -> 3 around 1, two levels
     5 -> 4 around 1        9 -> 8 around 1
     7 -> 6 around 1       10 -> 4 around 1, two levels
   Preferring fewest levels, then the narrowest ring that achieves it. */
const PACK_SYM = [2, 3, 4, 6, 8];

function packShapes(n) {
  const out = [];
  for (const r of PACK_SYM)
    if (n % (r + 1) === 0) out.push({ r, levels: n / (r + 1) });
  /* shortest first, then narrowest */
  out.sort((a, b) => a.levels - b.levels || a.r - b.r);
  return out;
}

function packFor(sol, roomBelow, vacuumBase = false) {
  if (!sol.tanks || !sol.tanks.list.length) return null;
  /* Only one kind of tank can go in a ring, so pack the largest identical run
     and leave everything else stacked on the centre column. Counting the whole
     stage — three sizes mixed — described a shape that could not be built. */
  const run = sol.tanks.list.reduce((best, x) =>
    !best || x.c > best.c || (x.c === best.c && x.t.wet > best.t.wet) ? x : best, null);
  if (!run || run.c < 3) return null;
  /* The bottom stage sets the frontal area itself, so widening it is not free —
     there is nothing below to hide behind. That only matters where there is air:
     a group lifting off from Minmus or the Mun pays no drag at all, and refusing
     to pack its base was the atmospheric rule applied where it does not belong.
     Caller passes Infinity for the base and, in vacuum, tells us to allow it. */
  if (!isFinite(roomBelow) && !vacuumBase) return null;

  const td = diaOf(run.t);
  /* A count with no buildable ring is not the end of it — set one tank aside on
     the centre column and try again. Eleven has no symmetric arrangement, but ten
     is two levels of four around one, so eleven becomes that plus a spare stacked
     above. Peel one at a time and stop at the first count that works, since every
     tank left out of the ring is height not saved. */
  for (let n = run.c; n >= 3; n--) {
    for (const sh of packShapes(n)) {
      if (sh.levels >= n) continue;                 // no height saved
      const cols = sh.r * sh.levels;                // tanks that move off the centre
      const pk = { r: sh.r, levels: sh.levels, cols,
        width: clusterSpan(sh.r + 1, td),
        tank: run.t, packedCount: n, spare: run.c - n,
        mass: cols * (PACK_JOIN.m + PACK_BRACE.m),
        cost: cols * (PACK_JOIN.cost + PACK_BRACE.cost) };
      /* Ask stageSize what the stage would actually measure rather than
         predicting it. Parallel stacks and boosters both widen a stage in ways
         that do not compose the way a bare ring does — a hand-rolled formula had
         a three-stack stage coming out 5.29 m against a 5.19 m base while
         claiming 4.04 m. */
      if (stageSize({ ...sol, packed: pk }).width > roomBelow + 1e-6) continue;
      return pk;
    }
  }
  return null;
}

/* The pieces every view of a stage needs: how tall each part of it is, how wide
   it spans, and what the packed ring looks like. stageSize sums these into a
   bounding box; the elevation lays them out as rectangles. Both used to work them
   out separately, and drifted apart three times — on width, on height, and again
   when packing arrived, each time leaving the drawing describing a different
   rocket from the one the slenderness check was judging. */
function stageGeom(sol) {
  const td = sol.tanks ? diaOf(sol.tanks.list[0].t) : diaOf(sol.engine);
  const ed = widthOf(sol.engine, diaOf(sol.engine));
  /* Parallel columns: height is one column, not the sum. Width spans them, and
     the drag area is every column, since none hides behind another. */
  const S = sol.stacks || 1;
  let tank = S > 1 ? tankStackLen(sol.perStack) : tankStackLen(sol.tanks);
  /* Only the packed run gets shorter. Everything else still stacks on the centre
     column above and below it, so take out the height of the tanks that moved
     into the ring rather than scaling the whole run. */
  if (sol.packed) {
    const p = sol.packed;
    const one = heightOf(p.tank, 1.15 * p.tank.prop / (Math.PI / 4 * Math.pow(diaOf(p.tank), 2)));
    tank -= one * (p.packedCount - p.levels);
  }
  /* Everything here is per column. With radial stacks sol.n counts every engine
     on the stage, so using it for the cluster span drew a three-stack stage as a
     three-engine cluster on one tank — engines far wider than the tank they sit
     under. */
  const perEng = sol.n / S;
  /* Two different widths. The engine block spans its own cluster and nothing
     more — a single Poodle under a packed tank ring is still one Poodle wide.
     The stage as a whole spans whichever is broader, which is what the bounding
     box and the drag area want. Sharing one number drew the engine at the ring's
     width. */
  const engineSpan = Math.max(td, clusterSpan(perEng, ed));
  const span = Math.max(engineSpan, sol.packed ? sol.packed.width : 0);
  const engine = engineLen(sol.engine);
  const coupler = sol.coupler ? heightOf({ n: sol.coupler.n }, 0.3) : 0;
  const decoupler = sol.decoupler ? heightOf({ n: sol.decoupler.n }, 0.15) : 0;
  const adapters = sol.adapters
    ? sol.adapters.parts.map((t) => ({ t,
        h: heightOf(t, 1.15 * t.prop / (Math.PI / 4 * Math.pow(diaOf(t), 2))),
        w: diaOf(t) }))
    : [];
  return { td, ed, S, perEng, span, engineSpan, tank, engine, coupler, decoupler, adapters,
    pack: sol.packed
      ? { r: sol.packed.r, w: sol.packed.width, td, levels: sol.packed.levels,
          spare: sol.packed.spare || 0,
          /* Height of one level of the ring, so the elevation can draw the block
             band by band instead of as one tall rectangle. */
          levelH: heightOf(sol.packed.tank,
            1.15 * sol.packed.tank.prop / (Math.PI / 4 * Math.pow(diaOf(sol.packed.tank), 2))) }
      : null };
}

function stageSize(sol) {
  const g = stageGeom(sol);
  const { td, ed, S, perEng, span, tank } = g;
  /* A radial engine bolts to the side of the tank rather than sitting under it,
     so it adds a little frontal area in the tank's shadow — the same treatment
     radial boosters get — instead of tiling across the base. Counting two Thuds
     as a stacked cluster doubled this stage's area and charged it roughly twice
     the drag it should see. */
  const eArea = areaOf(sol.engine, Math.PI / 4 * ed * ed);
  const tArea = sol.tanks && sol.tanks.list.length
    ? areaOf(sol.tanks.list[0].t, Math.PI / 4 * td * td)
    : Math.PI / 4 * td * td;
  const area = (isRadial(sol.engine)
    ? tArea + perEng * eArea * 0.85         // bolted to the side, in the tank's shadow
    : Math.max(tArea, perEng * eArea)) * (S > 1 ? 1 + (S - 1) * 0.85 : 1);
  /* The 0.3 m that used to stand in for "some structure" is now the parts
     themselves: the decoupler at the stage top, any adapter between tank and
     engine, and the coupler a cluster hangs from. All measured. */
  const struct = g.decoupler + g.adapters.reduce((a, x) => a + x.h, 0) + g.coupler;
  return {
    len: tank + g.engine + struct,
    width: (sol.boosters ? span + 2 * widthOf(sol.boosters.part, diaOf(sol.boosters.part)) : span)
      + (S > 1 ? 2 * td : 0),        // a ring of stacks around the middle one
    /* Width without the boosters. They are gone by about 18 km, so a stack that
       looks stout on the pad can be a pencil for the rest of the ascent — which
       is when it flips. The slenderness limit judges what is left. */
    coreWidth: Math.max(span, td) + (S > 1 ? 2 * td : 0),      // side by side, or a triangle
    stacks: S,
    area,
  };
}

/* Flying a trajectory costs a couple of hundred milliseconds, and the same
   vehicle gets simulated twice — once while choosing a stage count, once for the
   flight card. Key on the numbers that actually change the flight. */
const _simCache = new Map();
function simCached(veh, target) {
  const key = veh.bodyName + "|" + target + "|" + veh.payload.toFixed(3) + "|" +
    veh.stages.map((x) => [x.mdot.toFixed(4), x.prop.toFixed(3), x.dry.toFixed(3),
      x.area.toFixed(2), x.boosters ? x.boosters.n + ":" + x.boosters.prop.toFixed(2) : "-"]
      .join(",")).join(";");
  if (_simCache.has(key)) return _simCache.get(key);
  const r = optimiseTurn(veh, target, 40000);
  if (_simCache.size > 300) _simCache.clear();
  _simCache.set(key, r);
  return r;
}

const _atmoCache = {};
const atmoFor = (n) => (_atmoCache[n] ||= makeAtmo(BODY[n]));
/* Low orbit sits just clear of the air: 80 km at Kerbin, 60 at Duna and Laythe,
   100 at Eve. atmosphereDepth + 10 km reproduces all four. */
const orbitAlt = (n) => BODY[n].top + 10000;

/* Masses in the solver include everything stacked above, so strip the payload
   back out to get each stage on its own. Used for both the pad ascent and the
   climb back off whatever you landed on. */
function buildVehicleFor(stages, pick, bodyName, payloadDia = 0) {
  if (!BODY[bodyName]) return null;                 // airless, or no atmosphere data
  const sel = stages.filter((s) => pick(s) && s.sol);
  if (!sel.length) return null;
  const simStages = sel.map((s) => {
    const sol = s.sol, e = sol.engine, b = sol.boosters;
    const bWet = b ? b.n * b.part.m : 0, bProp = b ? b.n * b.part.fuelM : 0;
    return {
      mdot: (sol.n * e.fv) / (e.iv * 9.80665),
      isp: ispCurve(e.iv, e.ia, ispCut(e)),
      prop: sol.prop - bProp,
      dry: sol.dry - s.payloadIn,
      wet: sol.total - s.payloadIn - bWet,
      dia: diaOf(e), area: stageSize(sol).area,
      boosters: b ? { n: b.n, mdot: b.part.fv / (b.part.iv * 9.80665),
        isp: ispCurve(b.part.iv, b.part.ia, ispCut(b.part)), prop: b.part.fuelM,
        dry: b.part.dry, wet: b.part.m, dia: diaOf(b.part),
        /* Real drag cubes put a solid booster's axial face 16% above a plain
           circle of its bore — the nozzle and fins stick out past the casing.
           Cylindrical tanks match the circle to within 1%, so only this needs
           correcting. */
        area: 1.16 * Math.PI / 4 * Math.pow(diaOf(b.part), 2),
        /* Asparagus changes what a booster pool is. Instead of one tank that all
           the side stacks share and empty together, it is a queue of pairs: the
           outermost pair feeds every engine on the rocket, empties, and leaves —
           taking its mass AND its drag with it — and then the next pair does the
           same. Both effects have to step down together, which is why this has to
           reach the simulator and not just the rocket equation. */
        asparagus: !!sol.asparagus,
        pairProp: b.part.fuelM * 2, pairDry: b.part.dry * 2,
        pairArea: 2 * 1.16 * Math.PI / 4 * Math.pow(diaOf(b.part), 2) } : null,
    };
  });
  return { body: BODY[bodyName], atmo: atmoFor(bodyName), bodyName,
    payload: sel[sel.length - 1].payloadIn, stages: simStages,
    payloadArea: payloadDia > 0 ? Math.PI / 4 * payloadDia * payloadDia : 0 };
}

/* A save name for the craft. Deterministic — the same configuration always gives
   the same name, so it is stable while you tweak, and changes when the mission
   does. Built from where you are going and what you intend to do there, with the
   adjective and the suffix drawn from a hash of the rest of the settings. */
const NAME_WORDS = {
  flyby: ["Drive-By", "Wave", "Peek", "Flyby", "Glance", "Sightsee"],
  orbit: ["Circuit", "Loiter", "Lap", "Orbiter", "Vigil", "Holding Pattern"],
  land:  ["Descent", "Touchdown", "Boots", "Lander", "Arrival", "Faceplant"],
};
const NAME_ADJ = ["Ambitious", "Reluctant", "Overengineered", "Slightly Concerning",
  "Structurally Optimistic", "Barely Adequate", "Suspiciously Cheap", "Unreasonable",
  "Well-Strutted", "Mostly Symmetrical", "Provisional", "Emphatic", "Unhurried",
  "Load-Bearing", "Theoretically Sound"];
const NAME_TAIL = ["Mk1", "Mk2", "Mk3", "Mk4", "Mk7", "Rev B", "Rev C", "Rev D",
  "Prototype", "Final", "Final (2)", "Final (Actual)", "Flight Article", "Block II"];
const NAME_JOKE = ["Jeb Approved", "Bill Says No", "Bob Has Concerns", "Val Insisted",
  "Struts Extra", "Chutes Optional", "Fins Were Free", "Do Not Revert",
  "Quicksave First", "More Boosters", "This Time For Sure", "Wernher Signed Off"];

function craftName({ origin, dest, profile, returning, payload, objective, k, mass }) {
  const seed = [origin, dest, profile, returning, objective, k,
    Math.round(payload * 10), Math.round(mass || 0)].join("|");
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const pick = (arr, salt) => arr[Math.abs((h ^ Math.imul(salt, 2654435761)) >>> 0) % arr.length];
  const where = String(dest).replace(/ orbit$/i, "").replace(/^Low | Orbit$/gi, "");
  const verb = pick(NAME_WORDS[profile] || NAME_WORDS.orbit, 1);
  const adj = pick(NAME_ADJ, 2);
  const tail = pick(NAME_TAIL, 3);
  const joke = pick(NAME_JOKE, 4);
  const trip = returning ? " & Back" : "";
  return {
    name: `${where} ${verb}${trip} — ${adj} ${tail}`,
    sub: joke,
    short: `${where}-${verb.replace(/\s+/g, "")}${returning ? "-RT" : ""}-${tail.replace(/[^A-Za-z0-9]/g, "")}`,
  };
}

/* ================================== UI ================================== */
/* Defensive: a row can legitimately carry no number — the parallel-stacks note
   has no mass of its own — and a formatter that throws on null takes the whole
   page down with it. */
const fmt = (x, d = 0) => (x === null || x === undefined || !isFinite(x))
  ? "—"
  : x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/* KSP shows mission elapsed time as T+ HH:MM:SS, so match it — a figure you can
   read straight off the game clock beats one you have to convert in your head.
   A Kerbin day is six hours, and days only appear when something actually runs
   that long. */
function hms(sec) {
  const x = Math.max(0, Math.round(sec));
  const d = Math.floor(x / 21600);
  const h = Math.floor((x % 21600) / 3600), m = Math.floor((x % 3600) / 60), s2 = x % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (d ? `${d}d ` : "") + `${pad(h)}:${pad(m)}:${pad(s2)}`;
}

export default function KSPMissionPlanner() {
  const [origin, setOrigin] = useState("Kerbin");
  const [dest, setDest] = useState("Mun");
  const [profile, setProfile] = useState("land");
  const [returning, setReturning] = useState(true);   // most missions are meant to come home
  const [needGimbal, setNeedGimbal] = useState(true);
  const [planeNow, setPlaneNow] = useState(false);
  const [asparagus, setAsparagus] = useState(false);
  const [maxAspect, setMaxAspect] = useState(14);
  const [payloadDia, setPayloadDia] = useState(1.25);
  const [payload, setPayload] = useState(2.5);
  const [margin, setMargin] = useState(10);
  const [extraDv, setExtraDv] = useState(0);
  const [chutes, setChutes] = useState(true);
  const [boosters, setBoosters] = useState(true);
  const [objective, setObjective] = useState("cost");
  /* Expansions, checked against the uploaded configs: no MakingHistory folder,
     Serenity present. Making History carries seven liquid engines and the whole
     stock 1.875 m tank line, so leaving it on was putting parts in designs that
     do not exist in this install. Breaking Ground ships no engines and no fuel
     tanks, so it cannot change a launch vehicle — its box is shown but inert
     rather than pretending to filter something. */
  /* Checked against the uploaded configs: no MakingHistory folder, ReStock+
     present. Breaking Ground had a box until it was clear it ships no engines
     and no fuel tanks, so it could never change a launch vehicle. */
  const [expansions, setExpansions] = useState({ mh: false, rs: true });
  const hasMH = expansions.mh, hasRS = expansions.rs;
  const [splitBy, setSplitBy] = useState(() => new Map());
  const [unlocked, setUnlocked] = useState(() =>
    withDeps(DATA.nodes, new Set(Object.entries(DATA.nodes).filter(([, v]) => v.lvl <= 5).map(([k]) => k))));
  const [cuts, setCuts] = useState(null);   // null = follow defaultCuts
  const [showTech, setShowTech] = useState(false);
  const [showOrigin, setShowOrigin] = useState(false);
  const [showDest, setShowDest] = useState(true);
  const [excluded, setExcluded] = useState(() => new Set());   // parts the user has ruled out
  /* The part roster is setup, not a per-session choice: it describes your install
     and what you have researched, and retyping it every time would be tedious.
     Persisted through the artifact storage API — localStorage is unavailable
     here. Mission settings are deliberately not saved; those you do want to
     change run to run. */
  const [hydrated, setHydrated] = useState(false);
  /* Asparagus needs fuel to cross from a dropped stack into the core. A radial
     decoupler will do it — crossfeed is a right-click toggle on the TT-38K, which
     arrives with Stability — and a pair of fuel ducts is the alternative. Until
     one of those is researched the option is not offered, because the build is
     not possible. */
  const crossfeedOk = useMemo(() =>
    unlocked.has("Stability") || unlocked.has("Advanced Construction")
    || unlocked.has("Fuel Systems"), [unlocked]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const got = window.storage && await window.storage.get("ksp-planner:roster");
        const v = got && JSON.parse(got.value);
        if (live && v) {
          if (Array.isArray(v.unlocked)) setUnlocked(withDeps(DATA.nodes, new Set(v.unlocked)));
          if (Array.isArray(v.excluded)) setExcluded(new Set(v.excluded));
          if (v.expansions) setExpansions(v.expansions);
          if (typeof v.needGimbal === "boolean") setNeedGimbal(v.needGimbal);
        }
      } catch { /* nothing saved yet, or storage unavailable — defaults stand */ }
      if (live) setHydrated(true);
    })();
    return () => { live = false; };
  }, []);
  const [openNode, setOpenNode] = useState(null);
  const toggleExcluded = (n) => setExcluded((p) => {
    const s2 = new Set(p); s2.has(n) ? s2.delete(n) : s2.add(n); return s2;
  });

  const orbitHere = dest === "Low orbit" || dest === "Stationary orbit";

  const destList = useMemo(() => {
    const here = ["Low orbit"];
    if (hasSync(origin)) here.push("Stationary orbit");
    const rest = origin === "Kerbin"
      ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
      : Object.keys(SYS).filter((b) => b !== "Sun" && b !== origin);
    return [...here, ...rest];
  }, [origin]);

  /* Jool has no surface, and a same-body orbit has no arrival, so landing
     profiles have nothing to act on. Fall back rather than let the state go
     stale when someone switches destination while Land is selected. */
  const canLand = useMemo(() =>
    !orbitHere && buildRoute(dest, "land", true, origin).some((l) => l.kind === "land"),
    [dest, origin, orbitHere]);
  const effProfile = (!canLand && profile === "land") ? "orbit" : profile;

  const route = useMemo(() => buildRoute(dest, effProfile, chutes, origin, returning, planeNow),
    [dest, effProfile, chutes, origin, returning, planeNow]);
  const totalDv = route.reduce((s, l) => s + l.dv, 0);
  const budget = Math.round(totalDv * (1 + margin / 100) + extraDv);

  /* The uploaded configs had no MakingHistory folder, so those seven liquid
     engines are off by default — the solver was building around a Wolfhound that
     is not installed. The MH-derived boosters (Thoroughbred, Clydesdale, Shrimp,
     Mite) stay: they moved into the base game in 1.11. */
  useEffect(() => {
    if (!hydrated) return;                 // do not write the defaults back over a saved roster
    try {
      const w = window.storage && window.storage.set("ksp-planner:roster", JSON.stringify({
        unlocked: [...unlocked], excluded: [...excluded], expansions, needGimbal,
      }));
      if (w && w.catch) w.catch(() => {});
    } catch { /* storage unavailable — the session still works, it just will not persist */ }
  }, [hydrated, unlocked, excluded, expansions, needGimbal]);

  const engines = useMemo(
    () => DATA.engines.filter((e) => unlocked.has(e.t) && (hasMH || !e.mh)
      && (hasRS || !e.rs) && !excluded.has(e.n)),
    [unlocked, hasMH, hasRS, excluded]);
  const EXPANSION_PARTS = useMemo(() => ({
    stock: DATA.engines.filter((e) => !e.mh && !e.rs).length
         + DATA.tanks.filter((t) => !t.mh && !t.rs).length,
    mh: DATA.engines.filter((e) => e.mh).length + DATA.tanks.filter((t) => t.mh).length,
    rs: DATA.engines.filter((e) => e.rs).length + DATA.tanks.filter((t) => t.rs).length,
  }), []);
  const tanks = useMemo(
    () => DATA.tanks.filter((t) => (!t.t || unlocked.has(t.t))
      && (hasMH || !t.mh) && (hasRS || !t.rs) && !excluded.has(t.n)),
    [unlocked, hasMH, hasRS, excluded]);

  /* Group legs into stages using the cut positions (cut i = separate after leg i). */
  const effCuts = useMemo(() => cuts ?? defaultCuts(route), [cuts, route]);

  const groups = useMemo(() => {
    const g = []; let cur = [];
    route.forEach((leg, i) => {
      if (leg.free) return;
      cur.push(leg);
      if (effCuts.has(i)) { g.push(cur); cur = []; }
    });
    if (cur.length) g.push(cur);
    return g;
  }, [route, effCuts]);

  /* Solve bottom-up: the last group flies first, so build from the top down.
     Each segment can expand into several stages, so the result is flattened. */
  /* Solving takes seconds, so it cannot sit on the render path. It runs as an
     async walk that yields between segments and again between stage-count
     candidates; each yield is a chance for React to paint and for a newer run to
     cancel this one. `token` is the abandon signal — if the inputs change, the
     run in flight stops at its next yield instead of finishing work nobody
     wants. */
  const [stages, setStages] = useState([]);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  useEffect(() => {
    const token = ++runId.current;
    setBusy(true);          // instantly, in the same tick as the change
    const alive = () => runId.current === token;
    const breathe = () => new Promise((r) => setTimeout(r, 0));


    (async () => {
      if (!hydrated) return;              // wait for the saved roster before spending a solve
      resetTally();
      const startedAt = Date.now();
      /* The veil is already up — it goes on synchronously above so it appears on
         the same tick as the click. This pause only debounces the work, so a
         flurry of edits costs one solve, and the yield lets React paint before the
         thread is seized. */
      await new Promise((r) => setTimeout(r, 120));
      if (!alive()) return;
      await breathe();
      if (!alive()) return;

      const out = [];
      let carried = payload + missionHardware(route, payload, origin, unlocked, excluded).mass;
      const srbs = engines.filter((e) => e.f.includes("SF") && e.fuelM > 0);
      for (let i = groups.length - 1; i >= 0; i--) {
        await breathe();
        if (!alive()) return;
        const legs = groups[i];
        const key = route.indexOf(legs[0]);
        /* The margin scales the route; the extra is a flat reserve on top of it.
           It rides on the last segment, which is the top of the stack — spare dv
           is only useful if it is still there at the end, and putting it lower
           would mean lifting fuel you then stage away. */
        const dv = legs.reduce((a, l) => a + l.dv, 0) * (1 + margin / 100)
          + (i === groups.length - 1 ? extraDv : 0);
        const isLaunch = legs.some((l) => l.kind === "ascent");
        const isLand = legs.some((l) => l.kind === "land" || l.kind === "ascentBack");
        const g = isLaunch ? 9.81 : Math.max(...legs.map((l) => l.g));
        const kind = isLaunch ? "launch" : isLand ? "land" : "space";
        const forced = splitBy.get(key) || 0;
        /* How many stages to allow. A stage asked for much more than about two
           km/s pays compound interest: its propellant is lifted by everything
           beneath it. Measured across budgets from 3 700 to 11 600 m/s the
           cheapest design lands on 1 100–2 600 m/s per stage, median 1 870, so
           the cap follows the budget rather than sitting at a fixed four — which
           was set when this only planned Mun trips and cost an Eeloo mission
           300 000 funds. One spare above the estimate, since the split is rarely
           even, and never more than six: past that nothing improved. */
        const autoK = Math.min(6, Math.max(2, Math.ceil(dv / 2200) + 1));
        const bodyName = isLaunch ? origin : (legs.find((l) => l.body) || {}).body;
        let res = solveGroup({ dv, payload: carried, engines, tanks, unlocked, excluded, needGimbal,
          maxAspect, expansions, asparagus, g, kind,
          boosters, srbs, bodyName, objective, minK: forced || 1, maxK: forced || autoK });

        /* The closed-form solver can pick a stage count the vehicle cannot fly —
           an upper stage that satisfies the rocket equation but has no pitch
           programme reaching orbit. On auto, walk the candidates cheapest first
           and take the first the simulator accepts. */
        if (res && isLaunch && !forced && BODY[bodyName] && res.byK.length > 1) {
          /* Keep the slenderness preference while looking for one that flies —
             sorting purely on score here threw away the solver's choice and put
             the pencil straight back. */
          /* Slenderness is a constraint the user set, not a tie-break. Ordering
             compliant designs first is not enough: when every one of them fails
             the ascent simulation the walk kept going and settled on a design
             that breaks the limit — a 0.144 t payload came back at 30.6:1 under
             a 14:1 setting, because the thin compliant stacks could not be flown
             and the fat one could.

             Better to keep the best compliant design and report that the sim
             could not fly it than to silently hand back something the user ruled
             out. Only when nothing compliant exists at all does an over-limit
             design get offered. */
          const compliant = [...res.byK].filter((x) => x && x.slim);
          const pool = compliant.length ? compliant : [...res.byK].filter(Boolean);
          const order = pool.sort((x, y) => x.chainScore - y.chainScore);
          let flew = false;
          for (const cand of order) {
            await breathe();
            if (!alive()) return;
            const veh = buildVehicleFor(cand.chain.map((c) => ({ isLaunch: true, legs,
              sol: c.sol, payloadIn: c.payloadIn })), () => true, bodyName, payloadDia);
            const flown = veh && simCached(veh, orbitAlt(bodyName));
            if (flown && flown.ok) { res = cand; flew = true; break; }
          }
          /* Nothing in the compliant pool could be flown. Keep the best of them
             anyway — the design is the one the user asked for, and the flight card
             will show that the ascent could not be simulated. */
          if (!flew && order.length) res = order[0];
        }

        /* The map's ascent figure is a rule of thumb; the simulator knows what
           this particular vehicle will actually spend. Sizing to the map and then
           reporting a higher flown cost — which is what happened, 3 740 built
           against 4 062 needed — hands you a rocket that cannot reach orbit.
           Re-solve against the flown cost until the vehicle carries it. */
        if (res && isLaunch && BODY[bodyName]) {
          for (let pass = 0; pass < 3; pass++) {
            await breathe();
            if (!alive()) return;
            const veh = buildVehicleFor(res.chain.map((c) => ({ isLaunch: true, legs,
              sol: c.sol, payloadIn: c.payloadIn })), () => true, bodyName, payloadDia);
            const flown = veh && simCached(veh, orbitAlt(bodyName));
            if (!flown || !flown.ok) break;
            const built = res.chain.reduce((a2, c) => a2 + c.sol.dv, 0);
            flown.carried = built;      // surfaced next to the ascent cost
            if (flown.total <= built) break;                  // it carries the flight
            const grown = solveGroup({ dv: flown.total * (1 + margin / 100),
              payload: carried, engines, tanks, unlocked, excluded, needGimbal, maxAspect, expansions, asparagus, g, kind,
              boosters, srbs, bodyName, objective, minK: forced || 1, maxK: forced || autoK });
            if (!grown) break;
            res = grown;
          }
        }

        if (!res) {
          out.unshift({ legs, key, want: dv, sol: null, payloadIn: carried,
            twrMin: 1, g, isLaunch, isLand, sub: 1, subCount: 1 });
          carried = NaN;
          break;
        }
        out.unshift(...res.chain.map((c, j) => ({ legs, key, want: c.want, sol: c.sol,
          payloadIn: c.payloadIn, twrMin: c.twrMin, g, isLaunch, isLand,
          sub: j + 1, subCount: res.k })));
        carried = res.total;
      }
      if (!alive()) return;
      setStages(out);
      setSearch({ ...TALLY, ms: Date.now() - startedAt });
      /* Unconditional: an abandoned run may have switched the veil on, and if this
         one finishes inside the 120 ms delay its own `shown` is false — so keying
         the reset off `shown` could leave the veil stuck on forever. */
      setBusy(false);
    })();

    return () => {};
  }, [hydrated, groups, route, payload, payloadDia, margin, extraDv, engines, tanks, boosters, splitBy, origin, objective, unlocked, excluded, needGimbal, maxAspect, asparagus]);


  const runSim = (pick, bodyName) => {
    const v = buildVehicleFor(stages, pick, bodyName, payloadDia);
    if (!v) return null;
    try {
      const alt = orbitAlt(bodyName);
      const r = simCached(v, alt);
      /* A vehicle that cannot fly is worth saying out loud — silence reads as
         "not simulated" when it actually means "this design cannot work". */
      return r && r.ok ? { ...r, veh: v, bodyName, target: alt }
                       : { ok: false, veh: v, bodyName, target: alt };
    } catch { return null; }
  };

  const ascent = useMemo(() => runSim((s) => s.isLaunch, origin), [stages, origin]);

  /* Climbing back off an atmosphere deserves the same treatment as the pad —
     more so at Eve, where sea level is 5 atm and engines barely push. */
  const returnAscent = useMemo(() => {
    const leg = route.find((l) => l.kind === "ascentBack");
    if (!leg) return null;
    return runSim((s) => s.legs.some((l) => l.kind === "ascentBack"), leg.body);
  }, [stages, route]);

  const geom = useMemo(() => {
    return stackGeometry(stages, payload);
  }, [stages, payload]);

  const srbAvail = engines.some((e) => e.f.includes("SF") && e.fuelM > 0);
  const airDescent = route.some((l) => l.kind === "land" && l.atm);

  const hardware = useMemo(() => missionHardware(route, payload, origin, unlocked, excluded), [route, payload, origin, unlocked, excluded]);

  const [search, setSearch] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const configText = useMemo(() => "KSP-PLANNER " + JSON.stringify({
    origin, dest, profile, returning, payload, payloadDia, margin, extraDv, objective,
    boosters, chutes, needGimbal, planeNow, asparagus, maxAspect, expansions,
    tech: [...unlocked].sort(),
    excluded: [...excluded].sort(),
    cuts: cuts ? [...cuts].sort((x, y) => x - y) : null,
    splits: [...splitBy.entries()],
  }), [origin, dest, profile, returning, payload, payloadDia, margin, extraDv, objective,
       boosters, chutes, needGimbal, planeNow, maxAspect, expansions, unlocked, excluded, cuts, splitBy]);

  /* Load a pasted configuration. Every field is checked on its own and a bad or
     missing one is simply left at its default — a config saved before a setting
     existed should still restore everything else rather than failing whole. The
     count of what was skipped is reported so it is not a silent partial load. */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState(null);

  const applyConfig = () => {
    const r = parseConfig(pasteText);
    if (r.error) { setPasteNote({ bad: true, msg: r.error }); return; }
    const v = r.values;
    if ("origin" in v) setOrigin(v.origin);
    if ("dest" in v) setDest(v.dest);
    if ("profile" in v) setProfile(v.profile);
    if ("returning" in v) setReturning(v.returning);
    if ("payload" in v) setPayload(v.payload);
    if ("payloadDia" in v) setPayloadDia(v.payloadDia);
    if ("margin" in v) setMargin(v.margin);
    if ("extraDv" in v) setExtraDv(v.extraDv);
    if ("objective" in v) setObjective(v.objective);
    if ("boosters" in v) setBoosters(v.boosters);
    if ("chutes" in v) setChutes(v.chutes);
    if ("needGimbal" in v) setNeedGimbal(v.needGimbal);
    if ("planeNow" in v) setPlaneNow(v.planeNow);
    if ("asparagus" in v) setAsparagus(v.asparagus);
    if ("maxAspect" in v) setMaxAspect(v.maxAspect);
    if ("expansions" in v) setExpansions(v.expansions);
    if ("tech" in v) setUnlocked(v.tech);
    if ("excluded" in v) setExcluded(v.excluded);
    if ("cuts" in v) setCuts(v.cuts);
    if ("splits" in v) setSplitBy(v.splits);
    setPasteNote({ bad: false,
      msg: `Loaded ${r.took} settings${r.left ? `, ${r.left} left at their defaults` : ""}.` });
    setPasteOpen(false); setPasteText("");
  };

  const copyConfig = async () => {
    /* Clipboard access is not guaranteed here, so fall back to showing the text
       for manual selection rather than failing silently. */
    try {
      await navigator.clipboard.writeText(configText);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { setShowConfig(true); }
  };

  const totalCost = stages.reduce((a, x) => a + (x.sol ? stageCost(x.sol) : 0), 0);
  const totalParts = stages.reduce((a, x) => a + (x.sol ? stageParts(x.sol) : 0), 0);

  const liftoff = stages[0]?.sol ? stages[0].sol.total : NaN;

  const craft = useMemo(() => craftName({ origin, dest, profile: effProfile, returning,
    payload, objective, k: stages.length, mass: liftoff }),
    [origin, dest, effProfile, returning, payload, objective, stages.length, liftoff]);

  /* [].every() is true, so an empty stage list read as "solved" and printed the
     NaN placeholder. Harmless while the solve was synchronous and stages were
     never empty; the async rewrite made the empty first render visible. */
  const ok = stages.length > 0 && stages.every((s) => s.sol);
  // the accent is the target's own tracking-station colour, lifted if too dark to read
  const dcolor = (() => {
    const k = bodyKey(dest);
    return k && BODY_HUE[k] ? edgeOf(BODY_HUE[k]) : C.sky;
  })();

  const setSplit = (key, k) => setSplitBy((p) => {
    const n = new Map(p); k ? n.set(key, k) : n.delete(key); return n;
  });

  const toggleCut = (i) => setCuts((p) => {
    const n = new Set(p ?? defaultCuts(route));
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const setTier = (lvl) => setUnlocked(withDeps(DATA.nodes,
    new Set(Object.entries(DATA.nodes).filter(([, v]) => v.lvl <= lvl).map(([k]) => k))));

  const vehicleClass =
    !ok ? "—" : liftoff < 20 ? "Sounding / light" : liftoff < 75 ? "Medium lifter"
    : liftoff < 250 ? "Heavy lifter" : liftoff < 700 ? "Super heavy" : "Kerbal-scale monster";

  return (
    <div style={{ background: C.ink, color: C.paper, minHeight: "100vh",
      fontFamily: "'Inter',system-ui,-apple-system,sans-serif", padding: "0 0 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .disp { font-family:'Barlow Condensed',Impact,sans-serif; text-transform:uppercase; letter-spacing:.06em; }
        .mono { font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace; font-variant-numeric:tabular-nums; }
        .eyebrow { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.22em;
                   text-transform:uppercase; color:${C.dim}; }
        button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
        button:focus-visible, input:focus-visible { outline:2px solid ${C.amber}; outline-offset:2px; }
        input[type=range]{ accent-color:${C.amber}; width:100%; }
        .chip { border:1px solid ${C.edge}; border-radius:2px; padding:5px 10px; font-size:12px;
                background:${C.panel2}; color:${C.muted}; transition:.12s; }
        .chip:hover { border-color:${C.dim}; color:${C.paper}; }
        .chip[data-on="1"] { background:${C.paper}; color:${C.ink}; border-color:${C.paper}; font-weight:600; }
        .card { background:${C.panel}; border:1px solid ${C.rule}; border-radius:3px; }
        @keyframes sweep { 0% { transform:translateX(-100%); } 100% { transform:translateX(386%); } }
        @keyframes fadein { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:.35; } 50% { opacity:1; } }
        @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
      `}</style>

      {/* ---------------------------- header ---------------------------- */}
      {/* Solving can take seconds at full tech, so say so plainly rather than with
          a hairline. Held back 120 ms so quick recalculations do not flash. */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: C.panel2, borderBottom: `1px solid ${C.amber}`,
        boxShadow: "0 2px 12px rgba(0,0,0,.45)",
        opacity: busy ? 1 : 0, pointerEvents: "none",
        transition: busy ? "opacity .08s ease-out" : "opacity .7s ease-in" }}>
        <div style={{ height: 4, background: C.rule, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "30%", background: C.amber,
            animation: busy ? "sweep 1s ease-in-out infinite" : "none" }} />
        </div>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "7px 20px",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: C.amber,
            animation: busy ? "pulse 1s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>
            Solving {origin} → {dest}
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            staging, engine selection and ascent simulation
          </span>
        </div>
      </div>

      <header style={{ borderBottom: `1px solid ${C.rule}`, background: C.panel,
        padding: "18px 20px", display: "flex", flexWrap: "wrap", gap: 20,
        alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">Kerbal Space Program 1.12 · {
            ["Stock", hasMH && "Making History", hasRS && "ReStock+"]
              .filter(Boolean).join(" + ")}</div>
          <h1 className="disp" style={{ margin: "6px 0 0", fontSize: 34, fontWeight: 700, lineHeight: .95 }}>
            Mission&nbsp;<span style={{ color: dcolor }}>Δv</span>&nbsp;Planner
          </h1>
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <Stat label="Δv budget" value={fmt(budget)} unit="m/s" color={dcolor} />
          <div style={{ marginLeft: "auto", textAlign: "right", maxWidth: 340 }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Save it as</div>
            <div style={{ fontSize: 13.5, color: C.paper, fontWeight: 600, lineHeight: 1.25 }}>
              {craft.name}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{craft.sub}</div>
          </div>
          <Stat label="Liftoff mass" value={ok ? fmt(liftoff, 1) : "—"} unit="t" />
          <Stat label="Stages" value={ok ? stages.length : "—"} unit="" />
          <Stat label="Height" value={ok ? geom.h.toFixed(1) : "—"} unit="m" small />
          <Stat label="Aspect" value={ok ? geom.ar.toFixed(1) : "—"} unit=":1"
            color={ok && geom.ar > maxAspect ? C.amber : undefined} small />
          <Stat label="Cost" value={ok ? fmt(totalCost) : "—"} unit="funds" small />
          <Stat label="Parts" value={ok ? totalParts : "—"} unit="" small />
          <Stat label="Class" value={vehicleClass} unit="" small />
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16,
        padding: 16, maxWidth: 1500, margin: "0 auto" }}>

        {/* ---------------------------- mission controls ---------------------------- */}
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Installed</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            {[["stock", "Stock"], ["mh", "Making History"], ["rs", "ReStock+"]].map(([k, lab]) => {
              const locked = k === "stock";
              return (
                <label key={k} style={{ display: "flex", gap: 6, alignItems: "center",
                  fontSize: 12.5, color: locked ? C.muted : C.paper,
                  cursor: locked ? "default" : "pointer" }}
                  title={locked ? "Always required" : undefined}>
                  <input type="checkbox" checked={locked ? true : expansions[k]} disabled={locked}
                    style={{ accentColor: dcolor }}
                    onChange={(e) => setExpansions((x) => ({ ...x, [k]: e.target.checked }))} />
                  {lab}
                  <span className="mono" style={{ fontSize: 10.5, color: C.dim }}>
                    {EXPANSION_PARTS[k]} parts</span>
                </label>
              );
            })}
          </div>

          <div style={{ borderTop: `1px solid ${C.rule}`, margin: "0 0 14px" }} />
            <button onClick={() => setShowTech(!showTech)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left" }}>
              <span className="eyebrow">Tech tree · {unlocked.size} of {Object.keys(DATA.nodes).length} nodes
                · {engines.length} engines, {tanks.length} tanks available
                {excluded.size > 0 && ` · ${excluded.size} part${excluded.size === 1 ? "" : "s"} excluded`}</span>
              <span style={{ color: C.dim, fontSize: 12, marginLeft: "auto" }}>{showTech ? "hide" : "edit"}</span>
            </button>
            {showTech && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  <span style={{ fontSize: 11, color: C.dim, alignSelf: "center", marginRight: 4 }}>
                    Unlock through tier:</span>
                  {[1,2,3,4,5,6,7,8,9].map((l) => (
                    <button key={l} className="chip" onClick={() => setTier(l)}>{l}</button>
                  ))}
                  {excluded.size > 0 && (
                    <button className="chip" style={{ marginLeft: 8 }}
                      onClick={() => setExcluded(new Set())}>
                      clear {excluded.size} exclusion{excluded.size === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gap: 14,
                  gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
                  {Object.keys(TIERS).map((lvl) => (
                    <div key={lvl}>
                      {TIERS[lvl].some((n) => (NODE_PARTS[n] || []).length) && (
                        <div className="eyebrow" style={{ marginBottom: 6 }}>Tier {lvl}</div>
                      )}
                      {TIERS[lvl].filter((n) => (NODE_PARTS[n] || []).length).map((n) => {
                        const parts = NODE_PARTS[n] || [];
                        const on = unlocked.has(n);
                        const off = parts.filter((x) => excluded.has(x.name)).length;
                        const open = openNode === n;
                        return (
                          <div key={n} style={{ padding: "2px 0" }}>
                            <div style={{ display: "flex", gap: 7, alignItems: "flex-start",
                              fontSize: 12 }}>
                              <input type="checkbox" checked={on}
                                style={{ marginTop: 2, accentColor: dcolor }}
                                onChange={() => {
                                  /* Turning a node off rules out everything under it;
                                     turning it back on restores the lot, including parts
                                     ruled out individually beforehand. So the node box is
                                     always a clean sweep either way. */
                                  const turningOn = !on;
                                  setUnlocked((p2) => {
                                    const s2 = new Set(p2);
                                    if (turningOn) s2.add(n); else s2.delete(n);
                                    return withDeps(DATA.nodes, s2);
                                  });
                                  setExcluded((p2) => {
                                    const s2 = new Set(p2);
                                    (NODE_PARTS[n] || []).forEach((y) =>
                                      turningOn ? s2.delete(y.name) : s2.add(y.name));
                                    return s2;
                                  });
                                }} />
                              <span style={{ color: on ? C.paper : C.dim,
                                cursor: "pointer", flex: 1, lineHeight: 1.3 }}
                                onClick={() => setOpenNode(open ? null : n)}>
                                {n}
                                <span className="mono" style={{ fontSize: 9.5, color: C.dim, marginLeft: 5 }}>
                                  {on ? `${parts.length - off}/${parts.length}` : parts.length}
                                </span>
                              </span>
                            </div>
                            {open && (
                              <div style={{ margin: "3px 0 6px 20px", paddingLeft: 8,
                                borderLeft: `1px solid ${C.rule}` }}>
                                {parts.map((x) => {
                                  /* A tick here means the solver can use the part, which
                                     needs the node researched AND the part not ruled out.
                                     Showing these ticked under a locked node claimed parts
                                     were in play that were not. Ticking one now researches
                                     the node as well, so the box does what it says. */
                                  const live = on && !excluded.has(x.name);
                                  return (
                                    <label key={x.name} style={{ display: "flex", gap: 6,
                                      alignItems: "flex-start", fontSize: 11, padding: "1.5px 0",
                                      cursor: "pointer", color: live ? C.muted : C.dim }}>
                                      <input type="checkbox" checked={live}
                                        style={{ marginTop: 2, accentColor: dcolor }}
                                        onChange={() => {
                                          if (!on) {
                                            /* Cherry-pick: research the node but take only
                                               this part, holding the rest back. */
                                            setUnlocked((p2) => withDeps(DATA.nodes, new Set(p2).add(n)));
                                            setExcluded((p2) => {
                                              const s2 = new Set(p2);
                                              (NODE_PARTS[n] || []).forEach((y) => s2.add(y.name));
                                              s2.delete(x.name);
                                              return s2;
                                            });
                                          } else toggleExcluded(x.name);
                                        }} />
                                      <span style={{ flex: 1, lineHeight: 1.25,
                                        textDecoration: on && excluded.has(x.name) ? "line-through" : "none",
                                        opacity: on ? 1 : 0.6 }}>
                                        {x.name}
                                      </span>
                                    </label>
                                  );
                                })}
                                {!on && (
                                  <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                                    not researched — ticking one part takes just that part
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

          <div style={{ borderTop: `1px solid ${C.rule}`, margin: "16px 0 14px" }} />

          {/* Almost every mission starts at Kerbin, so the full sixteen-body picker
              is a lot of furniture for a choice nobody makes. Folded by default;
              the destination is the opposite, since that is the thing you came to
              change. */}
          <PickerHead label="Launching from" value={origin} open={showOrigin}
            onToggle={() => setShowOrigin(!showOrigin)} />
          {showOrigin && (
            <div style={{ marginBottom: 16 }}>
              {origin !== "Kerbin" && (
                <button className="chip" style={{ marginBottom: 8 }}
                  onClick={() => { setOrigin("Kerbin"); setCuts(null); }}>
                  ← back to Kerbin
                </button>
              )}
              <BodyPicker color={dcolor} value={origin}
                options={Object.keys(SYS).filter((b) => b !== "Sun" && SYS[b].ascent)}
                onPick={(b) => {
                  setOrigin(b); setCuts(null);
                  const valid = new Set(["Low orbit", ...(hasSync(b) ? ["Stationary orbit"] : []),
                    ...(b === "Kerbin" ? Object.keys(DEST).filter((d) => !/Kerbin Orbit|Keostationary/.test(d))
                                       : Object.keys(SYS).filter((x) => x !== "Sun" && x !== b))]);
                  if (!valid.has(dest)) setDest("Low orbit");
                }} />
            </div>
          )}
          {!showOrigin && <div style={{ marginBottom: 16 }} />}

          <PickerHead label="Mission" value={dest} open={showDest}
            onToggle={() => setShowDest(!showDest)} />
          {showDest ? (
            <div style={{ marginBottom: 16 }}>
              <BodyPicker color={dcolor} value={dest} options={destList}
                onPick={(d) => { setDest(d); setCuts(null); }} />
            </div>
          ) : <div style={{ marginBottom: 16 }} />}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {Object.entries(PROFILES).map(([k, v]) => (
              <button key={k} className="chip" data-on={k === effProfile ? 1 : 0}
                disabled={k === "land" && !canLand}
                title={k === "land" && !canLand ? `${dest} has no surface to land on` : v.note}
                onClick={() => setProfile(k)}>{v.name}</button>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: C.rule, margin: "0 4px" }} />
            <button className="chip" data-on={returning ? 1 : 0}
              title={returning
                ? "Carries the fuel to come home again"
                : "One way — nothing is brought back"}
              onClick={() => setReturning(!returning)}>
              {returning ? "Return trip" : "One way"}
            </button>
          </div>
          {!orbitHere && !canLand && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: -10, marginBottom: 16 }}>
              {dest} has no surface to land on, so this is an orbital mission.
            </div>
          )}
          {orbitHere && (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: -10, marginBottom: 16 }}>
              You are launching straight into this orbit, so there is no arrival to shape —
              nothing to fly by, capture into, or land on.
            </div>
          )}
          <div style={{ display: "grid", gap: 18,
            gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            <Slider label="Payload delivered" value={payload} min={0.1} max={60} step={0.1} hardMax={2000}
              unit="t" onChange={setPayload}
              hint="Everything not counted as engine or tank: pod, probe, science, rover, cargo — and the lander's own kit, its legs and heat shield included." />
            <Slider label="Δv margin" value={margin} min={0} max={40} step={1} unit="%" hardMax={100}
              onChange={setMargin} hint="Reserve over the map value for inefficiency and correction burns." />
            {crossfeedOk && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                color: C.muted, margin: "8px 0" }}>
                <input type="checkbox" checked={asparagus}
                  onChange={(e) => setAsparagus(e.target.checked)} />
                Asparagus staging
                <span style={{ fontSize: 11, color: C.dim }}>
                  liquid side stacks feed the core and drop in pairs
                </span>
              </label>
            )}
            <Slider label="Payload width" value={payloadDia} min={0.625} max={5} step={0.625}
              unit="m" hardMax={10} onChange={setPayloadDia}
              hint="How wide the thing you are lifting actually is. It sets the drag the stack has to push through, and on a small rocket the payload is often the widest part of it." />
            <Slider label="Slenderness limit" value={maxAspect} min={6} max={30} step={0.5} unit=":1"
              hardMax={60} onChange={setMaxAspect}
              hint="Tallest the stack may be relative to its widest point, boosters excluded — they stage away inside the atmosphere and what is left has to stay pointed. A pencil wobbles, needs struts and flips under load." />
            <Slider label="Extra Δv" value={extraDv} min={0} max={1500} step={10} unit="m/s" hardMax={9000}
              onChange={setExtraDv}
              hint="A flat reserve added after the margin, carried on the top stage — for rendezvous, a contract you have not planned yet, or getting home when the map was optimistic." />
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Optimise for</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[["mass", "Lightest"], ["cost", "Cheapest"], ["parts", "Fewest parts"]].map(([k, lab]) => (
                  <button key={k} className="chip" data-on={objective === k ? 1 : 0}
                    onClick={() => setObjective(k)}>{lab}</button>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, lineHeight: 1.45 }}>
                Lightest minimises what leaves the pad. Cheapest gives up efficiency for
                price, taking plainer engines and carrying more propellant. Fewest parts
                favours self-contained boosters and the largest tanks that fit, and will
                accept a heavier rocket to save a part.
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Atmospheric descent</div>
              <button className="chip" data-on={needGimbal ? 1 : 0}
                title={needGimbal
                  ? "Stages flying through air must use a vectoring nozzle"
                  : "Fixed nozzles allowed everywhere — you will be steering on fins"}
                onClick={() => setNeedGimbal(!needGimbal)}>
                {needGimbal ? "Gimbal in atmosphere" : "Gimbal optional"}
              </button>
              <button className="chip" data-on={srbAvail && boosters ? 1 : 0} disabled={!srbAvail}
                style={srbAvail ? undefined : { opacity: 0.4, cursor: "default" }}
                title={srbAvail ? undefined : "No solid boosters researched yet"}
                onClick={() => srbAvail && setBoosters(!boosters)}>
                {boosters ? "Solid boosters allowed" : "Liquid only"}
              </button>
              <button className="chip" data-on={airDescent && chutes ? 1 : 0} disabled={!airDescent}
                style={airDescent ? undefined : { opacity: 0.4, cursor: "default" }}
                title={airDescent ? undefined : "Nothing on this route lands through an atmosphere"}
                onClick={() => airDescent && setChutes(!chutes)}>
                {chutes ? "Parachutes fitted" : "Powered descent only"}
              </button>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
                Cuts landing Δv to ~18% on Duna, Eve and Laythe. Add a heat shield to the payload mass.
              </div>
            </div>
          </div>
        </section>

        <Solving busy={busy} label={`Solving ${origin} → ${dest}…`}>
        {/* ---------------------------- route + stages ---------------------------- */}
        <div style={{ display: "grid", gap: 16,
          gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))" }}>

          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Route · read bottom to top</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Tap a <strong style={{ color: C.paper }}>scissor gap</strong> between stations to add or remove a
              staging event, and the whole mission is solved as one span until you add one.
              Cut where the hardware genuinely parts company — a lander left in orbit, a
              transfer stage dropped before descent — or where a segment will not close.
            </div>
            <RouteMap route={route} cuts={effCuts} onToggle={toggleCut} color={dcolor} stages={stages}
              onPlaneMode={setPlaneNow} />
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Vehicle · stage 1 at the bottom</div>
            {!ok && (
              <div style={{ border: `1px solid ${C.rust}`, borderRadius: 3, padding: 12,
                marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: C.rust }}>No solution for at least one stage.</strong>{" "}
                A single stock stage tops out near Isp·g₀·ln 9. Add a staging cut on the route, unlock a
                higher-Isp engine, or lower the payload.
              </div>
            )}
            <StageStack stages={stages} color={dcolor} splitBy={splitBy} onSetSplit={setSplit} />
          </section>
        </div>

        {ok && geom.ar > maxAspect && (
          <section className="card" style={{ padding: 14, borderColor: C.amber }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <strong style={{ color: C.amber }}>
                {geom.h.toFixed(0)} m on a {geom.w.toFixed(2)} m core — {geom.ar.toFixed(1)}:1.
              </strong>{" "}
              {geom.ar > 20
                ? "That is a pencil. Expect it to whip on the pad and flip once it picks up speed, whatever its Δv says."
                : "Tall enough to flex. Strut the joints, or it will wander off prograde during the turn."}
              <div style={{ color: C.muted, marginTop: 6 }}>
                Forcing a segment to fewer stages trades mass for a squatter stack — one stage
                instead of three is heavier but roughly half the aspect ratio. Optimising for cost
                or fewest parts also builds wider, since the cheap and the self-fuelled parts are
                the fat ones.
              </div>
            </div>
          </section>
        )}

        {/* ------------------------- ascent simulation ------------------------- */}
        {ascent && (
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Simulated ascent from Kerbin · real atmosphere, real Isp curves, integrated drag
            </div>
            <AscentPanel a={ascent} color={dcolor} />
          </section>
        )}
        {returnAscent && (
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Simulated ascent from {returnAscent.bodyName} · the climb home
            </div>
            <AscentPanel a={returnAscent} color={dcolor} />
          </section>
        )}

        {stages.some((x) => x.sol) && (
          <section className="card" style={{ padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Build · step through the staging
            </div>
            <BuildView stages={stages} payload={payload} color={dcolor} maxAspect={maxAspect} />
          </section>
        )}

        {/* ---------------------------- parts list ---------------------------- */}
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 3 }}>Parts list · build order</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
            Top of the stack first, working down to the pad — the order you assemble it in.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12,
            fontSize: 10.5 }}>
            {[["Engine", C.paper], ["Tank", C.muted], ["Adapter", C.violet],
              ["Decoupler", C.dim], ["Booster", C.mint], ["Mission hardware", C.sky]]
              .map(([lab, col]) => (
                <span key={lab} style={{ display: "flex", alignItems: "center", gap: 5, color: C.dim }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: col }} />
                  {lab}
                </span>
              ))}
          </div>
          <PartsTable stages={stages} payload={payload} hardware={hardware} color={dcolor} />
        </section>


        {/* Everything a run depends on, in one string. Pasting it back means we
            are looking at the same rocket rather than describing it to each other. */}
        <section className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {search && (
              <span className="mono" style={{ fontSize: 11, color: C.dim, marginRight: 4 }}>
                searched {fmt(search.stages + search.boosted)} stage designs across{" "}
                {fmt(search.chains)} stacks,{" "}
                {/* The counter records trajectories actually integrated. Ascents are
                    cached across solves, so a re-solve that reuses one legitimately
                    flies nothing new — which read as though the design had never
                    been flown at all. */}
                {search.flights > 0
                  ? <>flew {fmt(search.flights)} ascents, </>
                  : <>ascent reused from cache, </>}
                {(search.ms / 1000).toFixed(1)} s
              </span>
            )}
            <button className="chip" data-on={copied ? 1 : 0} onClick={copyConfig}>
              {copied ? "copied" : "Copy configuration"}
            </button>
            <button className="chip" data-on={pasteOpen ? 1 : 0}
              onClick={() => { setPasteOpen(!pasteOpen); setPasteNote(null); }}>
              Load configuration
            </button>
            {pasteNote && (
              <span style={{ fontSize: 11, color: pasteNote.bad ? C.rust : C.mint }}>
                {pasteNote.msg}
              </span>
            )}
            <span style={{ fontSize: 11, color: C.dim }}>
              Paste this into the chat and I can load the same build — every setting, the
              researched nodes and any parts you have ruled out.
            </span>
          </div>
          {pasteOpen && (
            <div style={{ marginTop: 10 }}>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste a KSP-PLANNER configuration here"
                style={{ width: "100%", height: 70, fontSize: 10.5, fontFamily: "monospace",
                  background: C.ink, color: C.muted, border: `1px solid ${C.rule}`,
                  borderRadius: 3, padding: 8, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="chip" data-on={1} onClick={applyConfig}>Load it</button>
                <button className="chip" onClick={() => { setPasteOpen(false); setPasteText(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {showConfig && (
            <textarea readOnly value={configText} onFocus={(e) => e.target.select()}
              style={{ width: "100%", height: 84, marginTop: 10, fontSize: 10.5,
                fontFamily: "monospace", background: C.ink, color: C.muted,
                border: `1px solid ${C.rule}`, borderRadius: 3, padding: 8, resize: "vertical" }} />
          )}
        </section>

        <footer style={{ fontSize: 11, color: C.dim, lineHeight: 1.7, padding: "4px 2px" }}>
          Part masses, costs, tech nodes and Isp curves are read from KSP 1.12.5 configs — Squad, Breaking Ground
          and ReStock+. Making History is off by default because it is not installed. Atmospheres are the exact
          stock pressure and temperature splines, and Isp follows each engine's own atmosphereCurve, so a vacuum
          bell correctly produces nothing at Eve's surface. Ascents are flown, not estimated: an RK4 integration
          at 0.1 s searches a two-parameter gravity turn, with drag assembled the way KSP assembles it, from the
          curves and constants in Physics.cfg.{" "}
          <strong style={{ color: C.muted }}>Where it is still approximate:</strong> drag counts only the
          frontal area against one representative cube coefficient, so nothing is occluded, a nose cone buys
          nothing, and neither does a fairing. Staging is serial — no asparagus, which is why an Eve return does
          not close. Δv between bodies is a Hohmann transfer through the real orbital elements, ignoring the
          eccentricity and the launch window you actually get. Whether a design flies is judged by this
          simulator, not by the game.
        </footer>
        </Solving>
      </div>
    </div>
  );
}

/* ------------------------------- small pieces ------------------------------- */
function Stat({ label, value, unit, color, small }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={small ? "disp" : "mono"} style={{ fontSize: small ? 19 : 24, fontWeight: 600,
        color: color || C.paper, marginTop: 3, lineHeight: 1.1 }}>
        {value}<span style={{ fontSize: 12, color: C.muted, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  );
}

/* Slider for feel, typed entry for precision — 2.72 t for a Mk1-3 pod is not
   something you find by dragging. The field keeps a draft string while focused so
   half-typed values like "1." are not fought, and commits on blur or Enter.
   Typing above the slider's range is allowed up to a hard cap rather than being
   silently clamped; the slider just pins at its maximum. */
function Slider({ label, value, min, max, step, unit, onChange, hint, hardMax }) {
  const [draft, setDraft] = useState(null);
  const cap = hardMax ?? max;
  const commit = (raw) => {
    const v = parseFloat(raw);
    if (isFinite(v)) onChange(Math.min(cap, Math.max(min, v)));
    setDraft(null);
  };
  const over = value > max;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="eyebrow">{label}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <input
            className="mono"
            value={draft ?? value}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => { setDraft(String(value)); e.target.select(); }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }}
            style={{ width: 62, textAlign: "right", fontSize: 14, padding: "2px 5px",
              background: C.panel2, color: C.paper, borderRadius: 3,
              border: `1px solid ${over ? C.amber : C.rule}` }} />
          <span className="mono" style={{ fontSize: 12, color: C.muted }}>{unit}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, value)}
        onChange={(e) => onChange(parseFloat(e.target.value))} style={{ marginTop: 8 }} />
      {hint && <div style={{ fontSize: 11, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
      {over && <div style={{ fontSize: 10.5, color: C.amber, marginTop: 3 }}>
        above the slider range — typed value in use</div>}
    </div>
  );
}

/* The signature element: the mission as a transit line you cut into stages. */
function RouteMap({ route, cuts, onToggle, color, stages, onPlaneMode }) {
  /* Which stage actually falls away at a cut. Every solved stage carries the route
     index its segment starts at, so the count through a cut is just the stages
     whose segment began at or before it. The label used to read off the cut's own
     ordinal, so the first cut always claimed "stage 1" even when four stages had
     already burned. */
  const stagesThrough = (i) => stages.filter((s) => s.sol && s.key <= i).length;
  const shown = route.filter((l) => !l.free);
  const rows = [...route].reverse();
  const cutIdx = [...cuts].sort((a, b) => a - b);

  return (
    <div>
      {rows.map((leg, ri) => {
        const i = route.length - 1 - ri;
        const last = i === shown.length - 1;
        const isCut = cuts.has(i);
        return (
          <div key={i}>
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10,
              alignItems: "center", minHeight: 34 }}>
              <div style={{ display: "flex", justifyContent: "center", position: "relative", height: 34 }}>
                <div style={{ width: 3, background: leg.free ? C.rule : color, height: "100%" }} />
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)",
                  width: 11, height: 11, borderRadius: "50%", background: C.ink,
                  border: `3px solid ${leg.free ? C.rule : color}` }} />
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.3,
                color: leg.free ? C.dim : C.paper }}>
                {leg.label}
                {leg.chuted && <span style={{ color: C.mint, fontSize: 10 }}> · chutes</span>}
                {/* The one leg whose cost is a choice rather than a number: pay it
                    in Δv now, or in waiting for a launch window. */}
                {leg.kind === "plane" && leg.cheap < leg.costly && (
                  <button className="chip" onClick={() => onPlaneMode(!leg.planeNow)}
                    style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px" }}
                    title={leg.planeNow
                      ? "Switch to timing the encounter at a node — far cheaper, but you wait for the window"
                      : "Switch to burning it out of low orbit — costs more, goes whenever you like"}>
                    {leg.planeNow ? "burning it now" : "timed at a node"}
                  </button>
                )}
                {leg.note && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{leg.note}</div>}
              </div>
              <div className="mono" style={{ fontSize: 13, color: leg.free ? C.dim : C.paper }}>
                {leg.dv === 0 ? "free" : `${fmt(leg.dv)}`}
              </div>
            </div>
            {!leg.free && !last && (
              <button onClick={() => onToggle(i)}
                aria-label={isCut ? "Remove staging event" : "Add staging event"}
                style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 10, width: "100%",
                  alignItems: "center", padding: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{ width: isCut ? 22 : 3, height: isCut ? 3 : 12,
                    background: isCut ? C.amber : color, transition: ".15s" }} />
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase",
                  color: isCut ? C.amber : C.rule, fontFamily: "'IBM Plex Mono',monospace",
                  textAlign: "left" }}>
                  {isCut ? (stagesThrough(i) ? `▲ stage ${stagesThrough(i)} separates` : "▲ separates here")
                    : "cut here"}
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageStack({ stages, color, splitBy, onSetSplit }) {
  const max = Math.max(...stages.map((x) => x.sol?.total || 1));

  // stages arrive bottom-first; collect them back under the segment they serve
  const segs = [];
  stages.forEach((s, i) => {
    const last = segs[segs.length - 1];
    if (last && last.key === s.key) last.items.push({ s, n: i + 1 });
    else segs.push({ key: s.key, legs: s.legs, items: [{ s, n: i + 1 }] });
  });

  return (
    <div>
      {segs.slice().reverse().map((seg) => {
        const need = seg.items.reduce((a, x) => a + x.s.want, 0);
        const pick = splitBy.get(seg.key) || 0;
        return (
          <div key={seg.key} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
              flexWrap: "wrap", gap: 8, marginBottom: 8, paddingBottom: 5,
              borderBottom: `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 12.5, color: C.muted }}>
                {seg.legs.map((l) => l.label.split(/[→(]/)[0].trim()).join(" · ")}
                <span className="mono" style={{ color: C.dim }}>{"  "}{fmt(need)} m/s</span>
              </span>
              <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span className="eyebrow" style={{ marginRight: 2 }}>stages</span>
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <button key={k} className="chip" data-on={pick === k ? 1 : 0}
                    onClick={() => onSetSplit(seg.key, k)}
                    style={{ padding: "1px 7px", fontSize: 10.5, letterSpacing: 0 }}>
                    {k === 0 ? `auto (${seg.items.length})` : k}
                  </button>
                ))}
              </span>
            </div>

            {seg.items.slice().reverse().map(({ s, n }, i) => {
              const sol = s.sol;
              const w = sol ? Math.max(14, (sol.total / max) * 100) : 20;
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 5 }}>
                    <span className="disp" style={{ fontSize: 15, fontWeight: 600 }}>
                      Stage {n}
                      {s.subCount > 1 && <span style={{ color: C.dim, fontWeight: 400, fontSize: 11,
                        marginLeft: 7, textTransform: "none", letterSpacing: 0 }}>
                        {s.sub} of {s.subCount} in this segment</span>}
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: C.muted }}>
                      need {fmt(s.want)} m/s</span>
                  </div>
                  {sol ? (
                    <div style={{ background: C.panel2, border: `1px solid ${C.rule}`,
                      borderLeft: `3px solid ${color}`, borderRadius: 2, padding: "10px 12px" }}>
                      <div style={{ height: 6, background: C.rule, borderRadius: 1, marginBottom: 10 }}>
                        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 1 }} />
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 8 }}>
                        <strong>{sol.n}×</strong> {sol.engine.n}
                        {sol.tanks && <span style={{ color: C.muted }}>
                          {" + "}{sol.tanks.list.map((x) => `${x.c}× ${x.t.n}`).join(" + ")}</span>}
                      </div>
                      {sol.boosters && (
                        <div style={{ fontSize: 13, marginBottom: 8, color: C.mint }}>
                          + <strong>{sol.boosters.n}×</strong> {sol.boosters.part.n}
                          <span style={{ color: C.dim }}>
                            {"  radial · "}{fmt(sol.boosters.dv)} m/s, separate at T+{hms(sol.boosters.burn)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                        {/* Match the solver's own tolerance. It accepts a stage at
                            99.5% of its share — a solid cannot be tuned to hit a
                            number exactly — so flagging a strict shortfall painted
                            a stage red for being 0.1 m/s under. */}
                        {sol.stacks > 1 && (
                          <span style={{ fontSize: 11.5, color: C.mint, fontWeight: 600 }}>
                            core + {sol.stacks - 1} radial
                          </span>
                        )}
                        <Mini label="Δv" v={`${fmt(sol.dv)} m/s`}
                          good={sol.dv >= s.want * 0.995}
                          note={sol.dv < s.want
                            ? `${fmt(s.want - sol.dv)} m/s under its ${fmt(s.want)} m/s share`
                            : null} />
                        <Mini label="TWR" v={`${sol.twr.toFixed(2)} → ${sol.twrBurnout.toFixed(2)}`}
                          good={sol.twr >= s.twrMin} />
                        <Mini label="Isp" v={`${sol.isp} s`} />
                        <Mini label="Wet" v={`${fmt(sol.wet, 1)} t`} />
                        <Mini label="Prop" v={`${fmt(sol.prop, 1)} t`} />
                        <Mini label="Burn" v={hms(sol.burn)} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: C.panel2, border: `1px dashed ${C.rust}`, borderRadius: 2,
                      padding: "12px", fontSize: 12.5, color: C.muted }}>
                      No stack reaches {fmt(s.want)} m/s carrying {fmt(s.payloadIn, 1)} t.
                      Raise the stage count above, or unlock a higher-Isp engine — one stage
                      tops out at Isp·g₀·ln 9.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* Header for a body picker that can be folded away. Open, it offers a way to
   collapse; closed, it shows what is selected and a way back in. The two pickers
   differ only in where they start — origin closed, destination open. */
const PickerHead = ({ label, value, open, onToggle }) => (
  <div onClick={onToggle} title={open ? "Fold this away" : "Open the picker"}
    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
      marginBottom: open ? 10 : 0, userSelect: "none" }}>
    <span className="mono" style={{ color: C.dim, fontSize: 10, width: 9,
      display: "inline-block", transition: "transform .12s",
      transform: open ? "rotate(90deg)" : "none" }}>▶</span>
    <span className="eyebrow">{label}</span>
    {!open && (
      <>
        <span className="chip" data-on={1}>{value}</span>
        <span className="chip">elsewhere…</span>
      </>
    )}
  </div>
);

const Mini = ({ label, v, good, note }) => (
  <span style={{ fontSize: 11.5 }} title={note || undefined}>
    <span className="eyebrow" style={{ marginRight: 5 }}>{label}</span>
    <span className="mono" style={{ color: good === false ? C.rust : C.paper }}>{v}</span>
    {note && good !== false && <span style={{ color: C.dim, marginLeft: 4 }}>·</span>}
  </span>
);

function PartsTable({ stages, payload, hardware, color }) {
  /* Listed the way you build it: payload at the top, then each stage downward to
     the one standing on the pad. Within a stage the order is physical too —
     decoupler at its top, then tanks, then any adapter, then the engine, with
     radial boosters last since they hang off the side. Stage numbers therefore
     count down, which is also how the staging list reads in game. */
  const rows = [];
  const solved = stages.map((s, i) => ({ s, n: i + 1 })).filter((x) => x.s.sol);
  [...solved].reverse().forEach(({ s, n }) => {
    if (s.sol.decoupler && s.sol.decoupler.qty > 0) {
      const q = s.sol.decoupler.qty;
      rows.push({ stage: n, part: s.sol.decoupler.n, qty: q,
        each: s.sol.decoupler.m / q, tot: s.sol.decoupler.m, kind: "struct" });
    }
    if (s.sol.rejoin)
      rows.push({ stage: n, part: s.sol.rejoin.n + " (inverted)", qty: 1,
        each: s.sol.rejoin.m, tot: s.sol.rejoin.m, kind: "adapter" });
    if (s.sol.stacks > 1) {
      rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
        part: `— core + ${s.sol.stacks - 1} radial stacks, each of the following —` });
      if (s.sol.joiner)
        rows.push({ stage: n, part: `${s.sol.joiner.n} (holds a stack on, top and bottom)`,
          qty: 2, each: s.sol.joiner.m, tot: (s.sol.stacks - 1) * 2 * s.sol.joiner.m,
          kind: "struct" });
    }
    if (s.sol.packed) {
      const pk = s.sol.packed;
      rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
        part: `— ${pk.packedCount}× ${pk.tank.n} packed ${pk.r} around 1`
            + `${pk.levels > 1 ? `, ${pk.levels} levels` : ""}: ${pk.levels} on the centre column, `
            + `${pk.cols} radial at ${pk.r}× symmetry, crossfeed on so they drain together`
            + `${pk.spare ? `. The other ${pk.spare} stack${pk.spare > 1 ? "" : "s"} on the centre` : ""}`
            + `. Any smaller tanks stay stacked on the centre —` });
      rows.push({ stage: n, part: PACK_JOIN.n, qty: pk.cols,
        each: PACK_JOIN.m, tot: pk.cols * PACK_JOIN.m, kind: "struct" });
      rows.push({ stage: n, part: `${PACK_BRACE.n} (steadies each column)`, qty: pk.cols,
        each: PACK_BRACE.m, tot: pk.cols * PACK_BRACE.m, kind: "struct" });
    }
    /* With radial stacks the header says how many there are, so the rows below it
       are one stack's worth — quantities multiplied out under a header that
       already states the count read as though each stack needed all of them. */
    const S = s.sol.stacks || 1;
    /* Smallest at the top of the run, largest at the bottom — the order you would
       actually assemble them in, and the order a rocket wants structurally. */
    (S > 1 ? s.sol.perStack.list : s.sol.tanks ? s.sol.tanks.list : [])
      .slice().sort((a, b) => a.t.wet - b.t.wet)
      .forEach((x) => rows.push({ stage: n, part: x.t.n, qty: x.c, each: x.t.wet,
        tot: (S > 1 ? S : 1) * x.c * x.t.wet, kind: "tank" }));
    if (s.sol.coupler) {
      const pl = PLATE_SHROUD[s.sol.coupler.n];
      rows.push({ stage: n, qty: 1,
        each: s.sol.shroud ? s.sol.shroud.m : s.sol.coupler.m,
        tot: S * (s.sol.shroud ? s.sol.shroud.m : s.sol.coupler.m),
        kind: "adapter",
        part: s.sol.coupler.n + (pl
          ? ` · ${["", "Single", "Double", "Triple", "Quad"][s.sol.coupler.out] || s.sol.coupler.out + "-way"}`
            + (s.sol.shroud ? `, ${s.sol.shroud.v} shroud` : "")
          : "") });
    }
    s.sol.adapters?.parts.forEach((t) =>
      rows.push({ stage: n, part: t.n, qty: 1, each: t.wet, tot: t.wet, kind: "adapter" }));
    rows.push({ stage: n, part: s.sol.engine.n, qty: s.sol.n / S,   // per stack
      each: s.sol.engine.m, tot: s.sol.n * s.sol.engine.m, kind: "engine" });
    if (s.sol.boosters) {
      /* Decoupler first: it goes on the tank before the booster goes on it, and
         the list is meant to be read as a build order. */
      const b = s.sol.boosters;
      if (b.part.column)
        rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
          part: `— ${b.n} radial stacks, each of the following —` });
      else
        rows.push({ stage: n, part: "TT-38K Radial Decoupler", qty: b.n, each: 0.05,
          tot: b.n * 0.05, kind: "struct" });
      if (b.part.column)
        rows.push({ stage: n, part: "TT-38K Radial Decoupler", qty: 1, each: 0.05,
          tot: 0.05, kind: "struct" });
      if (b.part.dropTank)
        rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
          part: "— drop tanks, no engine on them: turn on crossfeed in the radial "
              + "decoupler's right-click menu, or run an FTX-2 fuel duct from each "
              + "into the core. Stage them off in pairs as they empty —" });
      else if (b.part.column && s.sol.asparagus)
        rows.push({ stage: n, kind: "note", qty: null, each: null, tot: null,
          part: "— asparagus: turn on crossfeed in the radial decoupler's right-click "
              + "menu, or run a pair of FTX-2 fuel ducts from each stack to the one "
              + "inboard of it. Stage the pairs outermost first —" });
      if (b.part.column) {
        /* A column is a stack and is built like one: tanks first, engine at the
           bottom — the same order every other stage is listed in. Engine-then-
           tanks read as though the list ended on tankage with nothing under it. */
        b.part.column.list.slice().sort((a2, b2) => a2.t.wet - b2.t.wet)
          .forEach((x) => rows.push({ stage: n, part: x.t.n,
            qty: x.c, each: x.t.wet, tot: b.n * x.c * x.t.wet, kind: "booster" }));
        rows.push({ stage: n, part: b.part.n, qty: 1, each: b.part.dry - b.part.column.dryMass,
          tot: b.n * (b.part.dry - b.part.column.dryMass), kind: "booster" });
      } else {
        rows.push({ stage: n, part: b.part.n, qty: b.n, each: b.part.m, tot: b.n * b.part.m, kind: "booster" });
      }
    }
  });
  const th = { textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.rule}`,
    fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: C.dim,
    fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", borderBottom: `1px solid ${C.panel2}`, fontSize: 12.5 };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
        <thead><tr>
          <th style={th}>Stage</th><th style={th}>Part</th>
          <th style={{ ...th, textAlign: "right" }}>Qty</th>
          <th style={{ ...th, textAlign: "right" }}>Each&nbsp;t</th>
          <th style={{ ...th, textAlign: "right" }}>Total&nbsp;t</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style={{ ...td, color: C.dim }}>—</td>
            <td style={{ ...td, color: color, fontWeight: 600 }}>Payload (pod, probe, science, cargo)</td>
            <td style={{ ...td, textAlign: "right" }} className="mono">1</td>
            <td style={{ ...td, textAlign: "right" }} className="mono">{fmt(payload, 2)}</td>
            <td style={{ ...td, textAlign: "right" }} className="mono">{fmt(payload, 2)}</td>
          </tr>
          {hardware && hardware.items.map((h, i) => (
            <tr key={"hw" + i}>
              <td style={{ ...td, color: C.dim }} className="mono"></td>
              <td style={{ ...td, color: C.sky, paddingLeft: 22 }}>
                ↳ {h.name}
                <span style={{ color: C.dim, fontSize: 11, marginLeft: 6 }}>{h.why}</span>
              </td>
              <td style={{ ...td, textAlign: "right" }} className="mono">{h.qty}</td>
              <td style={{ ...td, textAlign: "right", color: C.dim }} className="mono">—</td>
              <td style={{ ...td, textAlign: "right", color: C.dim, fontSize: 11 }}>in payload</td>
            </tr>
          ))}
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, color: C.muted }} className="mono">{r.stage}</td>
              <td style={{ ...td, color: r.kind === "engine" ? C.paper
                : r.kind === "booster" ? C.mint
                : r.kind === "adapter" ? C.violet
                : r.kind === "struct" ? C.dim
                : r.kind === "note" ? C.mint : C.muted,
                fontStyle: r.kind === "note" ? "italic" : "normal" }}>{r.part}</td>
              <td style={{ ...td, textAlign: "right" }} className="mono">{r.qty}</td>
              <td style={{ ...td, textAlign: "right", color: C.muted }} className="mono">
                {r.kind === "note" ? "" : fmt(r.each, 3)}
              </td>
              <td style={{ ...td, textAlign: "right" }} className="mono">
                {r.kind === "note" ? "" : fmt(r.tot, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* The whole point of simulating is to hand back something flyable, so this is a
   flight card, not a readout: five steps in the order you do them. Numbering is
   load-bearing here — it really is a sequence. */

/* Bodies laid out the way the system is: one row per planet, ordered outward
   from the sun, its moons trailing to the right. Planets carry the visual
   weight — they are the choice you make first, and a moon only means anything
   once you have picked the planet it belongs to. */
/* Each body's tracking-station orbit line colour, straight out of the Kopernicus
   dump — these are the hues the map view actually draws. Several are dark enough
   that they need lifting to read as a border on a dark panel, and light enough
   when filled that the label has to flip to dark ink. */
const BODY_HUE = { Moho:"#EEB688", Eve:"#6C20E4", Gilly:"#A27E6E", Kerbin:"#8ACAC2",
  Mun:"#9CA0B4", Minmus:"#8E74A0", Duna:"#A33F28", Ike:"#858A9A", Dres:"#5A4432",
  Jool:"#548513", Laythe:"#44569C", Vall:"#6E9BB4", Tylo:"#D3AAAA", Bop:"#BAA07E",
  Pol:"#DCE4AC", Eeloo:"#686A6A" };
const rgbOf = (h) => [1,3,5].map((i) => parseInt(h.slice(i, i+2), 16));
const lumOf = (h) => { const [r,g,b] = rgbOf(h).map((v) => v/255);
  return 0.2126*r + 0.7152*g + 0.0722*b; };
const lift = (h, t) => "#" + rgbOf(h).map((v) =>
  Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");
const hueFor = (b) => BODY_HUE[b] || C.sky;
const inkOn  = (h) => (lumOf(h) > 0.45 ? C.onLight : C.onDark);
const edgeOf = (h) => (lumOf(h) < 0.35 ? lift(h, 0.35) : h);

const SYSTEMS = [
  ["Moho", []], ["Eve", ["Gilly"]], ["Kerbin", ["Mun", "Minmus"]],
  ["Duna", ["Ike"]], ["Dres", []],
  ["Jool", ["Laythe", "Vall", "Tylo", "Bop", "Pol"]], ["Eeloo", []],
];

function BodyPicker({ options, value, onPick, color }) {
  // DEST calls it "Jool orbit" where SYS calls it "Jool", so match loosely
  const find = (b) => options.find((o) => o === b || o.startsWith(b + " "));
  const named = new Set();
  SYSTEMS.forEach(([pl, ms]) => [pl, ...ms].forEach((b) => { const o = find(b); if (o) named.add(o); }));
  const extras = options.filter((o) => !named.has(o));

  const planetBtn = (b, on, live) => { const h = hueFor(b); return {
    padding: "7px 11px", borderRadius: 3, minWidth: 84, textAlign: "left",
    fontFamily: "inherit", fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.01em",
    cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.4,
    background: on ? h : C.panel2, color: on ? inkOn(h) : C.paper,
    border: `1.5px solid ${on ? h : edgeOf(h)}`,
  }; };
  const moonBtn = (b, on) => { const h = hueFor(b); return {
    padding: "3px 9px", borderRadius: 3, fontFamily: "inherit", fontSize: 11.5,
    fontWeight: 400, cursor: "pointer",
    background: on ? h : "transparent", color: on ? inkOn(h) : C.muted,
    border: `1px solid ${on ? h : edgeOf(h)}`,
  }; };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      {extras.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {extras.map((o) => (
            <button key={o} className="chip" data-on={o === value ? 1 : 0}
              onClick={() => onPick(o)}>{o}</button>
          ))}
        </div>
      )}
      {SYSTEMS.map(([pl, ms]) => {
        const po = find(pl), mo = ms.map((b) => [b, find(b)]).filter(([, o]) => o);
        if (!po && !mo.length) return null;
        return (
          <div key={pl} style={{ display: "flex", alignItems: "flex-start", gap: 7, flexWrap: "nowrap" }}>
            <button style={{ ...planetBtn(pl, po === value, !!po), flexShrink: 0 }}
              onClick={() => po && onPick(po)} disabled={!po}>{pl}</button>
            {mo.length > 0 && (
              <>
                <span style={{ color: C.rule, fontSize: 12, marginTop: 7 }}>─</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, minWidth: 0, marginTop: 4 }}>
                  {mo.map(([b, o]) => (
                    <button key={b} style={moonBtn(b, o === value)}
                      onClick={() => onPick(o)}>{b}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- build view -------------------------------
   Side and plan elevations of whatever the solver just produced, drawn from the
   same geometry the drag model uses so the picture and the physics cannot drift
   apart. Solid fuel is 7.5 kg per 5 litre unit, so a booster's casing length
   comes out of its fuel mass the same way a tank's does. */
/* Solid fuel is 7.5 kg per 5 litre unit, so 1.5 t per cubic metre. The grain
   alone left the small boosters far too stubby — a Flea came out at 0.6 m — so
   add a nozzle and closure allowance that scales with bore. Schematic, not
   exact: this lands within about 20% across Flea to Kickback. */
const srbLen = (part) => {
  const real = PART_H[part.n];
  if (real !== undefined) return real;
  const d = diaOf(part);
  return (part.fuelM / 1.5) / (Math.PI / 4 * d * d) + 0.7 * d;
};

function ringPositions(n) {
  const centre = (n === 1 || n === 5 || n === 7 || n === 9) ? 1 : 0;
  const ring = n - centre;
  const pts = centre ? [[0, 0]] : [];
  for (let i = 0; i < ring; i++) {
    const th = (i / ring) * 2 * Math.PI - Math.PI / 2;
    pts.push([Math.cos(th), Math.sin(th)]);
  }
  return pts;
}

function BuildView({ stages, payload, color, maxAspect = 14 }) {
  const solved = stages.filter((x) => x.sol);
  const [step, setStep] = useState(0);
  if (!solved.length) return null;

  const hasBoost = !!solved[0].sol.boosters;
  const steps = [{ label: "On the pad", drop: 0, boost: true }];
  if (hasBoost) steps.push({ label: "Boosters away · core burns on", drop: 0, boost: false });
  solved.forEach((_, i) => steps.push({
    label: i === solved.length - 1 ? "Payload alone" : `Stage ${i + 1} spent`,
    drop: i + 1, boost: false }));
  const cur = steps[Math.min(step, steps.length - 1)];
  const live = solved.slice(cur.drop);

  // stack it bottom-up in metres
  const parts = [];
  let y = 0, wMax = Math.max(1, Math.cbrt(payload) * 1.2);
  live.forEach((st, i) => {
    const sol = st.sol;
    /* Same geometry the bounding box and the slenderness check use. Working it
       out again here is what let the drawing describe a different rocket. */
    const g = stageGeom(sol);
    const { td, ed, S, perEng } = g;
    const span = g.engineSpan;              // the engine block, not the tank ring
    const el = g.engine, tl = g.tank;
    if (el > 0) parts.push({ kind: "engine", y, h: el, w: span, n: perEng, ed, td, S });
    y += el;
    if (g.coupler > 0) {
      parts.push({ kind: "adapter", y, h: g.coupler, w: sol.coupler.top });
      y += g.coupler;
    }
    g.adapters.forEach((a2) => {
      parts.push({ kind: "adapter", y, h: a2.h, w: a2.w });
      y += a2.h;
    });
    /* A packed run is drawn band by band: any spare tanks sit on the centre
       column at their own width, then each level of the ring is one tank tall and
       as wide as the ring. Drawing the whole run as a single rectangle with two
       tanks stuck on the side described a shape that does not exist when the ring
       is more than one level deep. */
    if (tl > 0) {
      if (g.pack) {
        const pk = g.pack;
        const spareH = pk.spare * pk.levelH;
        const rest = tl - spareH - pk.levels * pk.levelH;
        if (rest > 0.01) { parts.push({ kind: "tank", y, h: rest, w: td, S }); y += rest; }
        for (let L = 0; L < pk.levels; L++) {
          parts.push({ kind: "tank", y, h: pk.levelH, w: td, S,
            pack: { r: pk.r, w: pk.w, td: pk.td } });
          y += pk.levelH;
        }
        if (spareH > 0.01) { parts.push({ kind: "tank", y, h: spareH, w: td, S }); y += spareH; }
        y -= tl;                            // the common y += tl below adds it back
      } else {
        parts.push({ kind: "tank", y, h: tl, w: td, S, pack: null });
      }
    }
    y += tl;
    if (sol.decoupler) {
      const dh = g.decoupler;      // shared with stageSize, not recomputed
      parts.push({ kind: "struct", y, h: dh, w: td });
      y += dh;
    }
    if (i === 0 && cur.boost && sol.boosters) {
      /* A liquid column is drawn at its tank diameter and its real stacked
         height, not the engine's — an SRB is one part, a column is a stack. */
      const bo = sol.boosters;
      const bd = bo.part.column ? diaOf(bo.part.column.list[0].t) : widthOf(bo.part, diaOf(bo.part));
      const bl = bo.part.column
        ? tankStackLen(bo.part.column) + engineLen(bo.part)
        : srbLen(bo.part);
      // they sit on the pad alongside the core, nozzles roughly level
      parts.push({ kind: "booster", y: 0, h: bl, w: bd, n: bo.n, core: td });
    }

  });
  const geo = stackGeometry(stages, payload);
  const payD = Math.max(0.9, Math.cbrt(payload) * 1.1);
  parts.push({ kind: "payload", y, h: payD * 1.3, w: payD });
  /* Measure both axes from what is actually drawn. Deriving an extent separately
     from the parts let the two disagree: anything wider than the estimate ran off
     the side, and a booster taller than the stage it is strapped to ran off the
     top, since the height came from the stack alone. */
  const H = parts.reduce((mx, q) => Math.max(mx, q.y + q.h), 0);
  wMax = 2 * parts.reduce((mx, q) => Math.max(mx,
    q.kind === "booster" ? q.core / 2 + q.w
    : q.pack ? q.pack.w / 2
    : q.S > 1 ? q.w / 2 + q.w * 1.02
    : q.w / 2), 0);

  // ---- side elevation ----
  const SH = 300, pad = 10;
  const scale = Math.min((SH - 2 * pad) / H, 150 / wMax);
  const sw = wMax * scale + 2 * pad, sh = H * scale + 2 * pad;
  const px = (v) => v * scale;
  const fill = { tank: C.tank, engine: C.engine, booster: color, payload: C.payloadFill,
    adapter: C.violet, struct: C.dim };

  const sideParts = [];
  parts.forEach((q, i) => {
    const yTop = sh - pad - px(q.y + q.h);
    if (q.kind === "booster") {
      // one ring, drawn as the two you would see side-on
      const xs = [sw / 2 - px(q.core / 2) - px(q.w), sw / 2 + px(q.core / 2)];
      xs.forEach((x, j) => sideParts.push(
        <rect key={`b${i}-${j}`} x={x} y={yTop} width={px(q.w)} height={px(q.h)}
          rx={px(q.w) / 3} fill={fill.booster} opacity={0.9}
          stroke={C.edge} strokeWidth="0.8" />));
      sideParts.push(
        <text key={`bn${i}`} x={sw / 2 + px(q.core / 2 + q.w / 2)} y={yTop - 3}
          textAnchor="middle" fontSize="8" fill={color} fontFamily="monospace">{q.n}×</text>);
      return;
    }
    sideParts.push(<rect key={i} x={sw / 2 - px(q.w) / 2} y={yTop}
      width={px(q.w)} height={px(q.h)} rx={q.kind === "payload" ? px(q.w) / 4 : 1.5}
      fill={fill[q.kind]} stroke={C.edge} strokeWidth="0.8" />);
    /* the other columns of a parallel stage, drawn either side of the middle */
    /* Outer stacks ring the core, so from the side you see the two widest of
       them flanking it — drawing every one in a row would be a lie about the
       width. */
    /* A packed tank block is a centre column with a ring around it, so from the
       side you see the two nearest ring tanks flanking the middle — the same way
       parallel stacks are drawn, and for the same reason. */
    if (q.pack) for (let c = 1; c <= 2; c++) {
      const off = (c % 2 ? 1 : -1) * (q.pack.w - q.pack.td) / 2;
      sideParts.push(<rect key={`${i}k${c}`} x={sw / 2 - px(q.pack.td) / 2 + px(off)}
        y={yTop} width={px(q.pack.td)} height={px(q.h)} rx={1.5}
        fill={fill[q.kind]} stroke={C.edge} strokeWidth="0.8" opacity="0.92" />);
    }
    if (q.S > 1) for (let c = 1; c <= Math.min(2, q.S - 1); c++) {
      const off = (c % 2 ? 1 : -1) * q.w * 1.02;
      sideParts.push(<rect key={`${i}p${c}`} x={sw / 2 - px(q.w) / 2 + px(off)}
        y={sh - pad - px(q.y) - px(q.h)} width={px(q.w)} height={px(q.h)} rx={1.5}
        fill={fill[q.kind]} stroke={C.edge} strokeWidth="0.8" opacity="0.92" />);
    }
    if (q.kind === "engine" && q.n > 1) sideParts.push(
      <text key={`n${i}`} x={sw / 2} y={yTop + px(q.h) / 2 + 3} textAnchor="middle"
        fontSize="9" fill={C.onLight} fontFamily="monospace" fontWeight="700">{q.n}×</text>);
  });

  // ---- plan view: widest live stage, plus any boosters ----
  const bottom = live[0] && live[0].sol;
  const PS = 150, planPayD = payD;
  const plan = [];
  if (bottom) {
    const td = bottom.tanks ? diaOf(bottom.tanks.list[0].t) : diaOf(bottom.engine);
    const ed = widthOf(bottom.engine, diaOf(bottom.engine));
    const S = bottom.stacks || 1;
    /* The plan's own extent: the ring of stacks reaches td from the middle plus
       its own radius, and boosters sit outside that again. Reusing the side
       elevation's width clipped whichever view was the wider of the two. */
    const bd0 = (cur.boost && bottom.boosters)
      ? (bottom.boosters.part.column ? diaOf(bottom.boosters.part.column.list[0].t)
        : widthOf(bottom.boosters.part, diaOf(bottom.boosters.part))) : 0;
    /* Reach has to cover whichever sticks out furthest. A cluster wider than the
       tank it sits under does, and it was not counted — so dropping the boosters
       shrank the estimate to the tank radius and the engine ring spilled over the
       edge. */
    const perEng0 = bottom.n / S;
    const clusterReach = Math.max(td, clusterSpan(perEng0, ed)) / 2;
    const reach = Math.max(
      (S > 1 ? td : 0) + clusterReach,
      bd0 ? (S > 1 ? td : td / 2) + bd0 : 0,
      bottom.packed ? bottom.packed.width / 2 : 0,
      planPayD / 2);
    const ps = (PS - 16) / (2 * reach);
    /* Where a stage runs parallel columns the plan is the arrangement seen from
       above: two side by side, three in a triangle. Each carries its own engines,
       so the cluster ring is drawn per column. */
    /* One in the middle, the rest evenly around it — the arrangement you get
       from radial symmetry in the VAB. */
    /* Start the ring at the right and work round, so the first pair sits left and
       right — which is the pair the side elevation draws. Starting at the top put
       the plan out of step with the elevation for no reason. */
    const centres = [[0, 0]];
    for (let i = 0; i < S - 1; i++) {
      const th = (i / (S - 1)) * 2 * Math.PI;
      centres.push([Math.cos(th) * td, Math.sin(th) * td]);
    }
    const perEng = bottom.n / S;
    const rr = (clusterSpan(perEng, ed) - ed) / 2 * ps;
    /* The plan is the view looking up from underneath, so it is drawn back to
       front: whatever sits highest goes down first and the engines, nearest the
       viewer, go last. Any packed tank ring is above the engines, so it belongs
       in that first pass. */
    const pk = bottom.packed;
    centres.forEach(([ox, oy], c) => {
      const X = PS / 2 + ox * ps, Y = PS / 2 + oy * ps;
      plan.push(<circle key={`core${c}`} cx={X} cy={Y} r={td / 2 * ps}
        fill={fill.tank} stroke={C.edge} strokeWidth="0.9" />);
      if (pk) {
        const rk = (pk.width - diaOf(pk.tank)) / 2 * ps;
        for (let i = 0; i < pk.r; i++) {
          const th = (i / pk.r) * 2 * Math.PI;    // right first, matching the elevation
          plan.push(<circle key={`k${c}_${i}`} cx={X + Math.cos(th) * rk}
            cy={Y + Math.sin(th) * rk} r={diaOf(pk.tank) / 2 * ps}
            fill={fill.tank} stroke={C.edge} strokeWidth="0.8" opacity="0.92" />);
        }
      }
    });
    /* Engines last: they are the closest thing to you looking up the stack. */
    centres.forEach(([ox, oy], c) => {
      const X = PS / 2 + ox * ps, Y = PS / 2 + oy * ps;
      ringPositions(perEng).forEach(([cx, cy], i) => plan.push(
        <circle key={`e${c}_${i}`} cx={X + cx * rr} cy={Y + cy * rr} r={ed / 2 * ps}
          fill={fill.engine} stroke={C.edge} strokeWidth="0.8" />));
    });
    if (cur.boost && bottom.boosters) {
      const b = bottom.boosters;
      const bd = b.part.column ? diaOf(b.part.column.list[0].t) : widthOf(b.part, diaOf(b.part));
      const br = ((S > 1 ? td : td / 2) + bd / 2) * ps;
      for (let i = 0; i < b.n; i++) {
        const th = (i / b.n) * 2 * Math.PI;      // right first, matching the elevation
        plan.push(<circle key={`b${i}`} cx={PS / 2 + Math.cos(th) * br}
          cy={PS / 2 + Math.sin(th) * br} r={bd / 2 * ps}
          fill={fill.booster} opacity={0.75} stroke={C.rule} strokeWidth="0.6" />);
      }
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
        {steps.map((st, i) => (
          <button key={i} className="chip" data-on={i === Math.min(step, steps.length - 1) ? 1 : 0}
            onClick={() => setStep(i)}>{st.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "nowrap", alignItems: "flex-end", overflowX: "auto" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Elevation</div>
          <svg width={Math.max(sw, 60)} height={sh} style={{ overflow: "visible" }}>{sideParts}</svg>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Plan</div>
          <svg width={PS} height={PS}>
            <circle cx={PS / 2} cy={PS / 2} r={(PS - 16) / 2} fill="none"
              stroke={C.rule} strokeDasharray="2 3" />
            {plan}
          </svg>
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 12,
        fontFamily: "monospace", fontSize: 11.5, color: C.muted }}>
        <span>{live.length} stage{live.length === 1 ? "" : "s"} attached</span>
        {/* Report the shared figure, not the drawing's own bounds — the sketch
            shows only the stages still attached at this step, so its extent
            changes as you page through the staging and is not the vehicle's. */}
        <span>{geo.h.toFixed(1)} m tall</span>
        <span>{geo.w.toFixed(2)} m across</span>
        <span style={{ color: geo.ar > maxAspect ? C.amber : C.muted }}>
          {geo.ar.toFixed(1)}:1 aspect
        </span>
      </div>
    </div>
  );
}

/* Everything downstream of the solve gets veiled while it runs. A bar pinned to
   the top of the page was the obvious idea and the wrong one: an artifact is an
   iframe sized to its content, so the parent page scrolls and nothing inside can
   stay in view. Marking the panels themselves works wherever you happen to be
   looking. */
function Solving({ busy, children, label }) {
  /* Both layers stay mounted and animate opacity, so the veil can fade out slowly
     instead of blinking away. Dimming is quick — you want to see it react — while
     coming back is gentle, which stops a fast recalculation from flashing. */
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "sticky", top: 12, height: 0, zIndex: 40,
        display: "flex", justifyContent: "center", pointerEvents: "none",
        opacity: busy ? 1 : 0,
        transition: busy ? "opacity .08s ease-out" : "opacity .7s ease-in" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9,
          background: C.panel2, border: `1px solid ${C.amber}`, borderRadius: 3,
          padding: "8px 14px", boxShadow: "0 4px 18px rgba(0,0,0,.6)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: C.amber,
            animation: busy ? "pulse 1s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>{label}</span>
        </div>
      </div>
      <div style={{ opacity: busy ? 0.22 : 1, filter: busy ? "grayscale(1)" : "none",
        transition: busy ? "opacity .08s ease-out, filter .08s ease-out"
                         : "opacity .7s ease-in, filter .7s ease-in",
        pointerEvents: busy ? "none" : "auto" }}>
        {children}
      </div>
    </div>
  );
}

function AscentPanel({ a, color }) {
  const atm = (a.veh.atmo.p(0) / 101.325).toFixed(2);
  if (!a.ok) {
    const m0 = a.veh.stages.reduce((t, x) => t + x.wet + (x.boosters ? x.boosters.n * x.boosters.wet : 0), 0) + a.veh.payload;
    return (
      <div style={{ border: `1px solid ${C.rust}`, borderRadius: 3, padding: 13, fontSize: 13, lineHeight: 1.55 }}>
        <strong style={{ color: C.rust }}>This design never reaches orbit from {a.bodyName}.</strong>{" "}
        No pitch programme gets {fmt(m0, 1)} t up to {Math.round(a.target / 1000)} km.
        <div style={{ color: C.muted, marginTop: 7 }}>
          The stages above were sized on vacuum Isp, but {a.bodyName} sits at {atm} atm on the
          surface, where engines deliver a fraction of their rated thrust and efficiency. The Δv
          map figure already assumes losses the rocket equation on its own cannot see. Add stages,
          choose engines with a flatter Isp curve, or expect a far heavier vehicle than the parts
          list suggests.
        </div>
      </div>
    );
  }
  const handed = a.handT >= 0;
  const hot = a.maxQ > 40000;
  const limited = a.limit && a.limit < 0.999;
  const cored = a.core && a.core < 0.999;
  /* TWR of the stage that has to finish the job, at the moment it lights. Below
     1.0 the ascent is unforgiving and the flight card should say so. */
  /* The two numbers side by side: what this flight costs, and what the rocket
     has. They used to be a map estimate and a simulated cost with nothing tying
     them together, so a vehicle built to 3 740 could sit next to a 4 062 flight
     and look fine. */
  const lowUpper = (() => {
    const st = a.veh && a.veh.stages[a.veh.stages.length - 1];
    if (!st) return null;
    const m = st.wet + a.veh.payload;
    const twr = st.mdot * st.isp(0) * 9.80665 / (m * a.veh.body.g0);
    return twr < 1 ? twr : null;
  })();
  const limitOn = a.veh.stages[0] && a.veh.stages[0].boosters ? "the boosters" : "the first stage";
  const steps = [
    ...(limited ? [[`Set ${limitOn} to ${Math.round(a.limit * 100)}% thrust`,
      "in the VAB, before you launch"]] : []),
    ...(cored ? [[`Fly the core at ${Math.round(a.core * 100)}% throttle`,
      "boosters stay at full — they cannot be throttled"]] : []),
    [a.bodyName === "Kerbin" ? "Full throttle, release the clamps" : "Full throttle, lift off", "straight up, SAS on"],
    [`At ${a.vKick} m/s, pitch ${a.kick}° east`, "then hold that attitude"],
    handed
      ? [`Hold it until T+${hms(a.handT)}`,
         `the prograde marker rises to meet your nose at ~${Math.round(a.handV)} m/s, ${(a.handAlt / 1000).toFixed(1)} km — switch SAS to prograde then`]
      : ["Hold that attitude all the way up", "prograde never catches your nose on this one"],
    /* The achieved apoapsis, not the target — drag on the way out of the air
       costs some of it — and the time the engine actually stops, not the moment
       the integration hands over to the coast. */
    [`Cut engines at T+${hms(a.tMeco != null ? a.tMeco : a.t)}`,
      `apoapsis will settle at ${(a.apo / 1000).toFixed(1)} km`],
    [`Coast ${a.tApo != null && a.tMeco != null
        ? hms(a.tApo - a.tMeco) : ""} to apoapsis`,
      a.tApo ? `apoapsis at T+${hms(a.tApo)} — warp through it` : "nothing to fly"],
    [`Circularise with ${fmt(a.circ)} m/s, held level`,
      a.circBurn
        ? (a.circBurn < 4
            ? `a ${a.circBurn.toFixed(1)} second tap right on the mark`
            : `${hms(a.circBurn)} of burn — start it ${hms(a.circBurn / 2)} early so it straddles apoapsis`)
        : "circularised"],
  ];
  const box = { background: C.panel2, border: `1px solid ${C.rule}`, borderRadius: 3, padding: "10px 12px" };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8, marginBottom: 14 }}>
        {steps.map(([main, sub], i) => (
          <div key={i} style={{ ...box, borderLeft: `3px solid ${i === 1 || i === 2 ? color : C.rule}` }}>
            <div className="mono" style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>{i + 1}</div>
            <div style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 3 }}>{main}</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 26px", marginBottom: hot ? 12 : 0 }}>
        <Stat label="Ascent costs" value={fmt(a.total)} unit="m/s" color={color} />
        {a.carried != null && (
          <Stat label="Vehicle carries" value={fmt(a.carried)} unit="m/s"
            color={a.carried >= a.total ? C.mint : C.rust} />
        )}
        <Stat label="Gravity loss" value={fmt(a.gLoss)} unit="m/s" small />
        <Stat label="Drag loss" value={fmt(a.dLoss)} unit="m/s" small />
        <Stat label="Steering loss" value={fmt(a.sLoss)} unit="m/s" small />
        <Stat label="Max Q" value={(a.maxQ / 1000).toFixed(1)} unit={`kPa at ${(a.maxQalt / 1000).toFixed(1)} km`} small />
        <Stat label="Peak Mach" value={a.maxMach.toFixed(2)} unit="" small />
      </div>

      {a.circBurn > 90 && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
          That circularisation runs {Math.round(a.circBurn)} s on a low-thrust stage. Centring it
          still helps, but over a burn that long the apoapsis drifts while you push — expect to
          arrive slightly elliptical and trim it on the next pass.
        </div>
      )}
      {a.circShort && (
        <div style={{ fontSize: 12, color: C.amber, marginBottom: 12, lineHeight: 1.5 }}>
          The stage that reaches orbit runs dry partway through this burn — the timing above
          assumes it continues on the stage above.
        </div>
      )}
      {a.marks && a.marks.length > 2 && (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 3, padding: 11, marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Fly this profile</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: C.dim, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em" }}>
                <th style={{ textAlign: "left", padding: "0 0 5px" }}>T+</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>Navball pitch</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>Speed</th>
                <th style={{ textAlign: "right", padding: "0 0 5px" }}>Altitude</th>
              </tr>
            </thead>
            <tbody>
              {a.marks.map((w, i) => (
                <tr key={i} style={{ borderTop: w.meco || w.apoMark ? `1px solid ${C.rule}` : "none" }}>
                  <td className="mono" style={{ padding: "3px 0",
                    color: w.meco || w.apoMark ? color : C.paper }}>
                    {hms(w.t)}{w.meco ? " · cutoff" : w.apoMark ? " · apoapsis" : ""}
                  </td>
                  <td className="mono" style={{ padding: "3px 0", textAlign: "right",
                    color: w.coast ? C.dim : color, fontWeight: w.coast ? 400 : 600 }}>
                    {w.apoMark ? "burn level"
                      : w.coast ? "coast"
                      : w.nav >= 0 ? `${w.nav}° up` : `${-w.nav}° down`}
                  </td>
                  <td className="mono" style={{ padding: "3px 0", textAlign: "right", color: C.muted }}>{w.v} m/s</td>
                  <td className="mono" style={{ padding: "3px 0", textAlign: "right", color: C.dim }}>
                    {(w.h / 1000).toFixed(1)} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.45 }}>
            Pitch is degrees above the horizon on the navball, flying east — fly the clock,
            not the altimeter. A shallow upper stage will level off and may nose slightly
            below the horizon while it builds horizontal speed, so altitude stops rising
            monotonically near the end and is a poor thing to steer by. If you are slow at
            a given time you are climbing too steeply: pitch further down rather than
            waiting for prograde to come to you. After cutoff there is nothing to fly until
            apoapsis; start the circularisation half its duration early so it straddles the
            mark. Hold that burn level — 0° on the navball — rather than on prograde. A long
            circularisation lifts you as it runs, so prograde tilts upward and following it
            pushes apoapsis ahead of you instead of raising periapsis behind you. Level is
            the attitude that closes the orbit.
            The circularisation figure below assumes you arrive at apoapsis on this
            profile — a few hundred m/s short there costs far more than that to fix.
          </div>
        </div>
      )}
      {lowUpper && (
        <div style={{ border: `1px solid ${C.amber}`, borderRadius: 3, padding: 11,
          fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: C.amber }}>Upper stage cannot hover.</strong>{" "}
          It lights at TWR {lowUpper.toFixed(2)}, so it will not hold altitude pointed
          upward — it has to be flown nearly level to build speed. If you keep following
          prograde while still climbing steeply it will bleed the whole stage climbing and
          arrive at apoapsis far too slow to circularise.
        </div>
      )}
      {cored && (
        <div style={{ border: `1px solid ${C.mint}`, borderRadius: 3, padding: 11,
          fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: C.mint }}>
            Hold the core at {Math.round(a.core * 100)}% until the boosters burn out.
          </strong>{" "}
          Solids have no shutdown, so at full throttle this stack carries its apoapsis
          well past the mark before you can stop it. Throttling the liquid core lands
          the two together and is worth about {fmt(Math.round((a.fullThrottle || 0) - a.total))} m/s.
        </div>
      )}
      {limited && (
        <div style={{ border: `1px solid ${C.mint}`, borderRadius: 3, padding: 11,
          fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: C.mint }}>
            Throttled to {Math.round(a.limit * 100)}% on {limitOn}.
          </strong>{" "}
          At full thrust this stack passes 40 kPa, where a real one tends to flip or shed
          parts. Right-click the part in the VAB and drag the thrust limiter — it cuts fuel
          flow with the thrust, so the stage simply burns longer at lower thrust and loses
          no Δv. Peak now {(a.maxQ / 1000).toFixed(0)} kPa.
        </div>
      )}
      {hot && (
        <div style={{ border: `1px solid ${C.rust}`, borderRadius: 3, padding: 11, fontSize: 12.5, lineHeight: 1.5 }}>
          <strong style={{ color: C.rust }}>
            Nothing stays under 40 kPa — peak is {(a.maxQ / 1000).toFixed(0)} kPa at {(a.maxQalt / 1000).toFixed(1)} km.
          </strong>{" "}
          {Number(atm) > 1.5 ? (
            <>That is {a.bodyName} rather than your rocket: {atm} atm at the surface makes high dynamic
            pressure unavoidable, and this is the gentlest trajectory that still reaches orbit. Treat
            the drag figure as indicative — it is well outside where the model was checked against
            Kerbin ascents.</>
          ) : (
            <>This vehicle is over-thrusted for the air it climbs through, where a real stack tends to
            flip or shed parts. Drop a booster, throttle the first stage back, or fly a shallower turn
            and accept the extra gravity loss.</>
          )}
        </div>
      )}

      <div className="mono" style={{ fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.7 }}>
        Atmosphere is {a.bodyName}'s own stock pressure and temperature spline — {atm} atm at the
        surface. Density and speed of sound fall straight out of it with nothing fitted. Isp follows a three-key
        curve pinned to the vacuum and sea-level figures. Drag takes the widest cross-section still
        attached plus any live boosters, on the stock transonic Cd hump — that part is an
        approximation, since the game bakes drag cubes per part and occludes them by how you stack.
      </div>
    </div>
  );
}
