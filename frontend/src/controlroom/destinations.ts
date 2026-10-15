export interface DestinationInfo { id: string; label: string; type: string; icon: string; category?: string; }

// Curated user-facing destinations & famous Coimbatore shops, malls, hospitals & tech hubs
export const DESTINATION_INFO: DestinationInfo[] = [
  { id: "6965305056", label: "Coimbatore Junction", type: "Railway Station", icon: "🚆", category: "Transit" },
  { id: "9921938865", label: "Gandhipuram Central Bus Stand", type: "Bus Stand", icon: "🚌", category: "Transit" },
  { id: "9687959213", label: "Brookefields Mall", type: "Shopping Mall", icon: "🛍️", category: "Shopping" },
  { id: "1482456201", label: "Cross Cut Road (Shopping Hub)", type: "Commercial / Gold Hub", icon: "✨", category: "Shopping" },
  { id: "330044079", label: "RS Puram (DB Road & Sri Krishna Sweets)", type: "Famous Sweets & Dining", icon: "🍬", category: "Dining" },
  { id: "9322756498", label: "Town Hall (Big Bazaar Street)", type: "Textile & Trade Center", icon: "🏢", category: "Shopping" },
  { id: "10593619297", label: "PSG Hospitals & PSG Tech", type: "Hospital & Institution", icon: "🏥", category: "Hospital" },
  { id: "9255100786", label: "KMCH (Kovai Medical Center)", type: "Hospital", icon: "🏥", category: "Hospital" },
  { id: "11760103234", label: "GKNM Hospital", type: "Specialty Hospital", icon: "🩺", category: "Hospital" },
  { id: "13999738605", label: "Ganga Hospital (Ram Nagar)", type: "Orthopaedic Hospital", icon: "🏥", category: "Hospital" },
  { id: "4961396448", label: "Ukkadam Bus Stand & Periyakulam Lake", type: "Bus Stand & Lake Front", icon: "🌊", category: "Transit" },
  { id: "9225687032", label: "Race Course (Food Street & Walkway)", type: "Recreation & Cafes", icon: "🏃", category: "Recreation" },
  { id: "13999738676", label: "CODISSIA Trade Fair & Fun Mall", type: "Convention & Mall", icon: "🛍️", category: "Shopping" },
  { id: "12381407399", label: "Tidel Park Coimbatore (IT SEZ)", type: "Tech Park", icon: "💻", category: "Tech" },
  { id: "3624457613", label: "Coimbatore Airport (CJB)", type: "Airport", icon: "✈️", category: "Transit" },
  { id: "4594632777", label: "Singanallur Bus Terminal", type: "Bus Terminal", icon: "🚌", category: "Transit" },
  { id: "1450492159", label: "Saravanampatti (Prozone Mall / CHIL IT)", type: "IT Corridor & Mall", icon: "🏬", category: "Tech" },
  { id: "4961511852", label: "Saibaba Colony (NSR Road Shops)", type: "Shopping & Dining", icon: "☕", category: "Shopping" },
  { id: "802493247", label: "Lakshmi Mills Urban Centre", type: "Urban Plaza & Retail", icon: "🏢", category: "Shopping" },
  { id: "803093962", label: "Ramanathapuram (Trichy Road Hub)", type: "Commercial Junction", icon: "📍", category: "Commercial" },
  { id: "2166371123", label: "CIT College (Civil Aerodrome Post)", type: "Engineering Institute", icon: "🎓", category: "Education" },
  { id: "294521062", label: "Perur Pateeswarar Temple", type: "Heritage Temple", icon: "🛕", category: "Heritage" },
  { id: "4845915135", label: "Eachanari Vinayagar Temple", type: "Famous Temple", icon: "🛕", category: "Heritage" },
  { id: "247429168", label: "Thudiyalur Commercial Junction", type: "Market Hub", icon: "🛒", category: "Commercial" },
  { id: "12918595310", label: "Kovaipudur (Sri Krishna College)", type: "Township & College", icon: "🎓", category: "Education" },
  { id: "2173379743", label: "Podanur Government Hospital", type: "Government Hospital", icon: "🏥", category: "Hospital" },
  { id: "5325645821", label: "Vadakovai (Avinashi Flyover)", type: "Commercial Hub", icon: "📍", category: "Commercial" },
  { id: "803271937", label: "Coimbatore Central (VOC Park)", type: "City Center & Zoo", icon: "🌳", category: "Recreation" },
];

export const DESTINATION_IDS = new Set(DESTINATION_INFO.map(d => d.id));
export const DESTINATION_BY_ID = new Map(DESTINATION_INFO.map(d => [d.id, d]));
