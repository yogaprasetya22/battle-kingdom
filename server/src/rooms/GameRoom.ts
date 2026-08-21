import { Room, Client } from "@colyseus/core";

interface PlayerData {
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: string;
}

export class GameRoom extends Room {
  maxClients = 50;
  private players = new Map<string, PlayerData>();
  private hostSessionId: string = "";
  
  // Cache the simulation configuration
  private currentConfig: any = null;

  onCreate(options: any) {
    // Listen for movement/state updates from clients and broadcast to others
    this.onMessage("updateState", (client, data: Omit<PlayerData, "id">) => {
      const player = this.players.get(client.sessionId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        player.z = data.z;
        player.rotY = data.rotY;
        player.anim = data.anim;
        this.broadcast("playerMoved", { id: client.sessionId, ...data }, { except: client });
      }
    });

    // Listen for skill casting from clients and broadcast to others
    this.onMessage("castSkill", (client, data: { skillId: string, originX: number, originZ: number }) => {
      this.broadcast("playerCastSkill", {
        id: client.sessionId,
        skillId: data.skillId,
        originX: data.originX,
        originZ: data.originZ
      }, { except: client });
    });

    // Listen for basic attack casting from clients and broadcast to others
    this.onMessage("castAttack", (client, data: { x: number, y: number, z: number, dx: number, dy: number, dz: number }) => {
      this.broadcast("playerCastAttack", {
        id: client.sessionId,
        ...data
      }, { except: client });
    });

    // --- Host Simulation Control Messaging ---
    this.onMessage("startSimulation", (client) => {
      if (client.sessionId === this.hostSessionId) {
        this.broadcast("simulationStarted");
      }
    });

    this.onMessage("resetSimulation", (client) => {
      if (client.sessionId === this.hostSessionId) {
        this.broadcast("simulationReset");
      }
    });

    this.onMessage("updateConfig", (client, config: any) => {
      if (client.sessionId === this.hostSessionId) {
        this.currentConfig = config;
        this.broadcast("configUpdated", config, { except: client });
      }
    });

    // Replicate unit coordinates and stats buffer from Host to Guests
    this.onMessage("syncUnits", (client, data: ArrayBuffer) => {
      if (client.sessionId === this.hostSessionId) {
        this.broadcast("unitsSynced", data, { except: client });
      }
    });

    // Replicate unit visual/sound effects from Host to Guests
    this.onMessage("syncUnitFX", (client, data: any) => {
      if (client.sessionId === this.hostSessionId) {
        this.broadcast("unitFXSynced", data, { except: client });
      }
    });

    // Forward guest projectile hits to host simulation
    this.onMessage("projectileHitUnit", (client, data: { targetIdx: number, damage: number }) => {
      if (this.hostSessionId && client.sessionId !== this.hostSessionId) {
        const host = this.clients.find(c => c.sessionId === this.hostSessionId);
        if (host) {
          host.send("unitTakeDamage", data);
        }
      }
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`Player joined: ${client.sessionId}`);
    
    const isHost = this.players.size === 0;
    const newPlayer: PlayerData = {
      id: client.sessionId,
      x: isHost ? -36 : 36,
      y: 2,
      z: 0,
      rotY: 0,
      anim: "Idle"
    };

    // If first player, they are the host
    if (this.players.size === 0) {
      this.hostSessionId = client.sessionId;
    }

    // 1. Send currently online players to the newcomer
    client.send("initialPlayers", Array.from(this.players.values()));

    // 2. Register newcomer in server state
    this.players.set(client.sessionId, newPlayer);

    // 3. Notify everyone about lobby status (who is the host)
    this.broadcast("lobbyInfo", { hostId: this.hostSessionId });

    // 4. Send current cached configuration to the newcomer if it exists
    if (this.currentConfig) {
      client.send("configUpdated", this.currentConfig);
    }

    // 5. Notify everyone else that player joined
    this.broadcast("playerJoined", newPlayer, { except: client });
    
    console.log(`Current active players: ${this.players.size}. Host is: ${this.hostSessionId}`);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Player left: ${client.sessionId}`);
    this.players.delete(client.sessionId);

    // If host leaves, assign the next available player as the new host
    if (client.sessionId === this.hostSessionId) {
      const remainingIds = Array.from(this.players.keys());
      this.hostSessionId = remainingIds[0] || "";
      console.log(`Host left. New host is: ${this.hostSessionId}`);
      this.broadcast("lobbyInfo", { hostId: this.hostSessionId });
    }

    this.broadcast("playerLeft", { id: client.sessionId });
  }

  onDispose() {
    console.log("Room disposed");
  }
}
