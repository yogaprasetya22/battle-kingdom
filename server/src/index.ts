import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const server = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    maxPayloadLength: 1024 * 1024 * 8, // Set max payload length to 8MB to prevent configuration sync crash
  })
});

// Register the room
gameServer.define("game_room", GameRoom);

gameServer.listen(port, "0.0.0.0").then(() => {
  console.log(`Colyseus game server listening on ws://0.0.0.0:${port}`);
});
