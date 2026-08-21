import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

// ponytail: no class field initializers — they shadow defineTypes getter/setters in ES2022+ target
export class Player extends Schema {
  declare id: string;
  declare x: number;
  declare y: number;
  declare z: number;
  declare rotY: number;
  declare anim: string;
}
defineTypes(Player, {
  id: "string",
  x: "number",
  y: "number",
  z: "number",
  rotY: "number",
  anim: "string"
});

export class GameState extends Schema {
  declare players: MapSchema<Player>;
}
defineTypes(GameState, {
  players: { map: Player }
});
