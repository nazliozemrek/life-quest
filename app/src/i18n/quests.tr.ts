// Turkish text for the curated quests, keyed by pool id (Quest.rationale is "pool:<id>") or, for the mock/exploration quests, by their English title.
export const QUESTS_TR: Record<string, { title: string; flavor: string; objective: string }> = {
  // Vitality
  "vit.water": { title: "Sabah Pınarından İç", flavor: "Her macera suyla başlar.", objective: "Uyandıktan sonraki bir saat içinde dolu bir bardak su iç." },
  "vit.walk20": { title: "Uzun Yolu Yürü", flavor: "Harita ancak ayaklarının altında büyür.", objective: "20 dakikalık bir yürüyüşe çık." },
  "vit.stretch": { title: "Zırhı Gevşet", flavor: "Tutuk eklemler düello kaybeder.", objective: "5 dakika esneme yap." },
  "vit.stairs": { title: "Kulenin Merdivenlerini Tırman", flavor: "Asansör tüccarlar içindir.", objective: "Bugün her seferinde asansör yerine merdiveni kullan." },
  "vit.workout": { title: "Kılıç Hafifleyene Dek Antrenman Yap", flavor: "Güç bulunmaz, inşa edilir.", objective: "30 dakikalık bir antrenman yap: koşu, spor salonu, evde devre antrenmanı ya da bir spor." },
  "vit.sleep": { title: "Kamp Ateşini Erken Küllendir", flavor: "Dinlenmek de bir istatistiktir.", objective: "Bu gece yatmadan 30 dakika önce telefonunu bırak." },
  "vit.veg": { title: "Yeşil Bir Şeyler Topla", flavor: "Erzak önemlidir.", objective: "Bir öğünde bir porsiyon sebze ya da meyve ye." },
  "vit.gym45": { title: "Salonuna Baskın Yap", flavor: "Demir, gelenleri unutmaz.", objective: "Spor salonunda 45 dakika antrenman yap." },
  "vit.gym20": { title: "Salonda Hızlı Vuruş", flavor: "Yirmi dakika da sayılır.", objective: "Spor salonuna git ve en az 20 dakika antrenman yap." },

  // Craft
  "crf.focus25": { title: "25 Dakikalık Derin Çalışma Döv", flavor: "Örs sabırlıyı ödüllendirir.", objective: "Bildirimler kapalıyken ana projen üzerinde 25 dakika çalış." },
  "crf.learn15": { title: "Kadim Parşömenleri İncele", flavor: "Her usta bir zamanlar çıraktı.", objective: "Bir beceri öğrenmeye 15 dakika ayır: bir kurs, bir eğitim videosu ya da bir kitap bölümü." },
  "crf.fix": { title: "Kırık Bir Şeyi Onar", flavor: "Küçük tamirler kaleyi ayakta tutar.", objective: "Ertelediğin küçük bir şeyi tamir et, dik, topla ya da bitir." },
  "crf.make": { title: "Ellerinle Bir Şey Yarat", flavor: "Fikir ucuzdur; eser değil.", objective: "Bir şey yapmaya 30 dakika ayır: çiz, yeni bir yemek pişir, inşa et, yaz ya da kod yaz." },
  "crf.ship": { title: "Eserini Loncaya Göster", flavor: "Çekmecedeki kılıç hiçbir şey kesmez.", objective: "Yaptığın bir şeyi biriyle paylaş ve geri bildirim iste." },
  "crf.workfirst": { title: "Lonca Salonunda İlk Darbeyi Vur", flavor: "En zor iş, gürültü başlamadan en kolay düşer.", objective: "İşte, mesajlarını açmadan önce en zor görevine 30 dakika çalış." },
  "crf.desk": { title: "Tezgâhı Temizle", flavor: "Temiz tezgâh hızlı tezgâhtır.", objective: "Masanı ya da çalışma alanını 5 dakika boyunca topla." },

  // Wealth
  "wlt.audit": { title: "Kesenin Hesabını Tut", flavor: "Bilge tüccar her altının nerede uyuduğunu bilir.", objective: "Ödediğin tüm abonelikleri ve her birinin aylık ücretini listele." },
  "wlt.track": { title: "Bugünün Defterini Yaz", flavor: "Sayılan altın korunan altındır.", objective: "Bugün harcadığın her şeyi not et." },
  "wlt.nospend": { title: "Keseyi Kapalı Tut", flavor: "Bazı günler hazine dinlenir.", objective: "Bugün zorunlu ihtiyaçlar dışında hiçbir şey harcama." },
  "wlt.save": { title: "Savaş Sandığını Doldur", flavor: "Kuşatmayı kazanacak olan gelecekteki sensin.", objective: "Küçük de olsa herhangi bir miktarı birikime aktar." },
  "wlt.career": { title: "Zanaat Belgelerini Bile", flavor: "Fırsat hazırlıklı olanı sever.", objective: "CV'ni, portfolyonu ya da bir iş teklifini geliştirmeye 25 dakika ayır." },
  "wlt.price": { title: "Kendinle Pazarlık Et", flavor: "Her alışverişin bir rakibi vardır.", objective: "Bugün bir alışverişten önce en az iki fiyatı karşılaştır." },

  // Charisma
  "cha.message": { title: "Eski Bir Müttefike Kuzgun Yolla", flavor: "Haber alınmayan ittifaklar söner.", objective: "Bir süredir konuşmadığın bir arkadaşına mesaj at." },
  "cha.call": { title: "Ocak Başında Konuş", flavor: "Ses, mesajın taşıyamadığını taşır.", objective: "Bir aile üyeni ya da arkadaşını ara ve en az 10 dakika konuş." },
  "cha.compliment": { title: "Bir Lütuf Bahşet", flavor: "Güzel söz bedavadır ama çok şey satın alır.", objective: "Birine içten ve somut bir iltifat et." },
  "cha.meet": { title: "Ekibi Topla", flavor: "Hiçbir kahraman tek başına kazanmaz.", objective: "Bir arkadaşınla yüz yüze buluş: kahve, yürüyüş ya da yemek." },
  "cha.listen": { title: "Ozanın Hikâyesini Dinle", flavor: "En iyi konuşanlar önce dinler.", objective: "Bugün bir sohbette, kendi hikâyeni anlatmadan önce üç soru sor." },
  "cha.thanks": { title: "Haraç Öde", flavor: "Minnet de bir para birimidir.", objective: "Birine senin için yaptığı belirli bir şey için teşekkür et." },

  // Mindset
  "mnd.journal": { title: "Vakayinameye Üç Satır Yaz", flavor: "Hikâyeyi kaydetmek sana düşer.", objective: "Günün hakkında üç satır yaz." },
  "mnd.breathe": { title: "İçindeki Fırtınayı Dindir", flavor: "Sükûnet bir silahtır.", objective: "5 dakika yavaş nefes egzersizi ya da meditasyon yap." },
  "mnd.read": { title: "Mum Işığında Oku", flavor: "Her sayfa bir haritadır.", objective: "20 dakika kitap oku." },
  "mnd.plan": { title: "Yarının Seferini Planla", flavor: "Savaşlar bir gece önceden kazanılır.", objective: "Yarının en önemli üç önceliğini yaz." },
  "mnd.offline": { title: "Sessiz Saati Yürü", flavor: "Akış bekleyebilir.", objective: "Bir saati sosyal medya ve haber olmadan geçir." },
  "mnd.gratitude": { title: "Ganimeti Say", flavor: "Küçük ganimet de ganimettir.", objective: "Bugün iyi giden üç şeyi yaz." },

  // Exploration quest built in code (explorationQuest in quest-pool.ts); no interpolated values.
  "Scout the Uncharted Streets": { title: "Keşfedilmemiş Sokakları Kolaçan Et", flavor: "Sisin ötesinde kimsenin haritalamadığı bir semt var. Şimdilik.", objective: "En yakın keşfedilmemiş semtte yürü ve 15 yeni hücreyi aç." },

  // Mock quests (MOCK_QUESTS in app/src/game/mock-world.ts); all literal strings, no interpolated values.
  "Drink from the Morning Spring": { title: "Sabah Pınarından İç", flavor: "Her maceracı güne matarasını doldurarak başlar.", objective: "Uyandıktan sonraki bir saat içinde dolu bir bardak su iç." },
  "Forge 25 Minutes of Deep Work": { title: "25 Dakikalık Derin Çalışma Döv", flavor: "Demirhane yalnızca kesintisiz odağa yanıt verir.", objective: "Bildirimler kapalıyken ana projen üzerinde 25 dakika çalış." },
  "Train at the Iron Hall": { title: "Demir Salon'da Antrenman Yap", flavor: "Demir Salon, gelen herkesin kaydını tutar.", objective: "Spor salonunda 45 dakika geçir." },
  "Chart the Fog East of Moda": { title: "Moda'nın Doğusundaki Sisi Haritala", flavor: "Haritacılar bu mahalleyi boş bırakmış. Düzelt bunu.", objective: "Evinin doğusundaki semtin sokaklarında 15 yeni harita hücresi açılana dek yürü." },
  "Audit the Coin Purse": { title: "Kesenin Hesabını Tut", flavor: "Kimsenin saymadığı keselerden altın sızar.", objective: "Ödediğin tüm abonelikleri ve her birinin aylık ücretini listele." },
  "Seal One Leak in the Treasury": { title: "Hazinedeki Bir Sızıntıyı Kapat", flavor: "Bugünkü tek kesinti, sonraki her ay altın demek.", objective: "Listendeki, artık kullanmadığın bir aboneliği iptal et." },
  "Watch the Sun Sink at Moda Coast": { title: "Moda Sahili'nde Güneşin Batışını İzle", flavor: "Kahramanlar bile ışığın sudan çekilişini izlemek için durur.", objective: "Gün batımında Moda Sahili'nde telefonsuz 10 dakika geçir." },
};
