const express = require("express");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const http = require("http");
const compression = require("compression");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
const videoCache = new Map(); // Cache az adatbázisból lekért videó adataira

// MySQL kapcsolat beállítása
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "videodb",
};

let db;
// Kapcsolat létrehozása az adatbázissal
(async () => {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log("Kapcsolódás sikeres");
  } catch (err) {
    console.error("Hiba a kapcsolódás során:", err);
  }
})();

app.use(compression()); // HTTP válaszok tömörítése a gyorsabb betöltés érdekében
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"], // Engedélyezi a szükséges HTTP metódusokat
    allowedHeaders: ["Content-Type", "Authorization"], // Engedélyezi a szükséges fejléceket
  })
);

// Főoldal, ami egy statikus html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Videó streamelés
const streamVideo = async (req, res, video) => {
  const fullPath = path.join(
    __dirname,
    `video/${video.path}${video.extension}`
  ); // A videó elérési útvonala
  const stat = await fs.promises.stat(fullPath); // A videó statisztikai adatai
  const fileSize = stat.size;

  /*
    A szerver elküldi a kért tartományt
    bytes=0-5242879/756399425 
    A nulla a kért adat kezdő byte-a. Itt most a legelejét kéri.
    A 5242879 a kért adat vége, itt most ez 5 MB
    A /756399425 a videó teljes mérete
  */
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    // A start értéke a chunk mérete alapján, azért min, hogy ne lépje túl a fájl teljes méretét
    const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    // A küldött tartalom mérete byte-ban
    const chunksize = end - start + 1;
    // A fájlból kiolvassa az adott tartományt
    const file = fs.createReadStream(fullPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`, // A kért adat range-e: kezdő-végpont/fájlméret
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    };

    res.writeHead(206, head);
    file.pipe(res); // A videó adott részét elküldi a kliensnek
  } else {
    // Ha nincs range, akkor elküldi az egész videót
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, head);
    fs.createReadStream(fullPath).pipe(res);
  }
};

app.get("/video/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Ellenőrizzük, hogy a videó megtalálható-e a cache-ben
    // Ezáltal nem kell folyamatosan lekérdezni az adatbázisból
    if (videoCache.has(id)) {
      const video = videoCache.get(id);
      await streamVideo(req, res, video); // Videó streamelése a kliensnek
    } else {
      // Ha nincs, lekérjük az adatbázisból
      const [rows] = await db.execute("SELECT * FROM video WHERE id = ?", [id]);
      const video = rows[0];

      if (!video) {
        return res.status(404).send("Video not found");
      }

      // Elmentés a cache-be
      videoCache.set(id, video);
      await streamVideo(req, res, video); // Videó streamelése a kliensnek
    }
  } catch (err) {
    logger.error("Error accessing video file:", err); // Hiba naplózása
    res.sendStatus(500); // 500-as hiba küldése a kliensnek
  }
});

// Szerver indítása
server.listen(8080, () => {
  console.log("Server is listening on port 8080");
});
