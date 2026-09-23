/* Lapangin mockup - dummy data - stage 1
   Field names here are the names the system will really use.
   Money is a decimal string, never a number, so nobody is tempted to do float maths. */

const SETTINGS = {
  currency: "IDR",
  currencySymbol: "Rp",
  currencyExponent: 0,
  taxPercent: "11.00",
  advanceBookingDays: 30,
  cancellationWindowHours: 12,
  minimumDurationMinutes: 60,
  venueTimezone: "Asia/Jakarta",
};

const VENUE = {
  id: "5e1b0a5e-1f4c-4a22-9d0e-7a2b9c1d33aa",
  slug: "gor-kemang",
  name: "GOR Kemang",
  address: "Jl. Kemang Raya No. 18, Jakarta Selatan",
  openingHours: "Senin sampai Minggu, 06:00 sampai 23:00",
  timezone: "Asia/Jakarta",
};

const COURTS = [
  {
    id: "c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201",
    venueId: VENUE.id,
    name: "Lapangan Futsal A",
    sport: "futsal",
    surface: "Rumput sintetis",
    floor: "Lantai 1",
    pricePerHour: "180000.00",
    status: "available",
    photoLabel: "Futsal A",
    amenities: ["Lampu malam", "Ruang ganti", "Tribun", "Parkir luas"],
    slots: [
      { start: "06:00", end: "07:00", state: "free" },
      { start: "07:00", end: "08:00", state: "free" },
      { start: "08:00", end: "09:00", state: "taken" },
      { start: "09:00", end: "10:00", state: "taken" },
      { start: "10:00", end: "11:00", state: "free" },
      { start: "11:00", end: "12:00", state: "free" },
      { start: "19:00", end: "20:00", state: "taken" },
      { start: "20:00", end: "21:00", state: "free" },
    ],
  },
  {
    id: "d2b8e3c5-4477-4d0b-8e21-1a7f9d22c302",
    venueId: VENUE.id,
    name: "Lapangan Badminton 3",
    sport: "badminton",
    surface: "Vinyl BWF",
    floor: "Lantai 2",
    pricePerHour: "65000.00",
    status: "available",
    photoLabel: "Badminton 3",
    amenities: ["Lampu malam", "Ruang ganti", "Sewa raket"],
    slots: [
      { start: "06:00", end: "07:00", state: "taken" },
      { start: "07:00", end: "08:00", state: "free" },
      { start: "08:00", end: "09:00", state: "free" },
      { start: "09:00", end: "10:00", state: "free" },
      { start: "10:00", end: "11:00", state: "free" },
      { start: "11:00", end: "12:00", state: "closed" },
      { start: "19:00", end: "20:00", state: "taken" },
      { start: "20:00", end: "21:00", state: "taken" },
    ],
  },
  {
    id: "e3c9f4d6-5588-4e1c-9f32-2b8a0e33d403",
    venueId: VENUE.id,
    name: "Lapangan Basket Indoor",
    sport: "basket",
    surface: "Parket kayu",
    floor: "Lantai 1",
    pricePerHour: "250000.00",
    status: "maintenance",
    photoLabel: "Basket",
    amenities: ["Papan skor elektronik", "Ruang ganti", "Tribun"],
    slots: [],
  },
];

/* The booking under review on page 2. The client holds no amounts of its own:
   every figure below arrives from the server and is only formatted here. */
const DRAFT_BOOKING = {
  courtId: COURTS[0].id,
  courtName: COURTS[0].name,
  venueName: VENUE.name,
  venueAddress: VENUE.address,
  bookingDate: "2026-09-27",
  bookingDateLabel: "Sabtu, 27 September 2026",
  startTime: "10:00",
  endTime: "12:00",
  durationHours: "2.00",
  unitPrice: "180000.00",
  subtotalAmount: "360000.00",
  taxAmount: "39600.00",
  totalAmount: "399600.00",
  currency: "IDR",
  customer: {
    name: "Azka Willian Muhammad",
    email: "azka@example.com",
    phone: "0812-1122-3344",
    note: "Tim 10 orang, minta bola pinjam kalau ada.",
  },
};

function formatIDR(decimalString) {
  const whole = String(decimalString).split(".")[0];
  return "Rp " + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
