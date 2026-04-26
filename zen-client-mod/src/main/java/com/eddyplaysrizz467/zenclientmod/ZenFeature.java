package com.eddyplaysrizz467.zenclientmod;

public enum ZenFeature {
  TPS_COUNTER("tps_counter", "TPS Counter", "Shows an estimated server tick rate."),
  FPS_COUNTER("fps_counter", "FPS Counter", "Shows your current FPS."),
  PING_COUNTER("ping_counter", "Ping Counter", "Shows your current connection latency."),
  COORDINATES("coordinates", "Coordinates", "Shows your XYZ position."),
  CLOCK("clock", "Clock", "Shows the current world time."),
  DAY_COUNTER("day_counter", "Day Counter", "Shows the current Minecraft day."),
  BIOME("biome", "Biome", "Shows the biome you are standing in."),
  SPEED("speed", "Speed", "Shows your current movement speed."),
  LIGHT_LEVEL("light_level", "Light Level", "Shows the light level at your feet."),
  HELD_DURABILITY("held_durability", "Held Durability", "Shows durability for your held item."),
  SNEAK_STATUS("sneak_status", "Sneak Status", "Shows whether you are sneaking."),
  COMPASS("compass", "Compass", "Shows a live compass that points where you are looking."),
  DIRECTION("direction", "Direction", "Shows the direction you are facing."),
  CPS_COUNTER("cps_counter", "CPS Counter", "Shows left and right clicks per second."),
  COMBO_COUNTER("combo_counter", "Combo Counter", "Tracks recent hit combos."),
  REACH_DISPLAY("reach_display", "Reach Display", "Shows the last hit distance."),
  KESTROKES("keystrokes", "Keystrokes", "Shows WASD plus mouse click state."),
  BOW_CHARGE("bow_charge", "Bow Charge Meter", "Shows bow draw progress."),
  PEARL_TIMER("pearl_timer", "Pearl Cooldown", "Shows your ender pearl cooldown."),
  ARROW_COUNT("arrow_count", "Arrow Count", "Shows how many arrows you are carrying."),
  ARMOR_STATUS("armor_status", "Armor Status", "Shows average armor durability."),
  POTION_STATUS("potion_status", "Potion Status", "Shows active potion effect count."),
  TARGET_HEALTH("target_health", "Target Health", "Shows the health of the entity you last hit."),
  ESP("esp", "ESP", "Highlights selected entity groups."),
  TOGGLE_SPRINT("toggle_sprint", "Toggle Sprint", "Keeps sprint enabled while moving forward."),
  SPRINT_ASSIST("sprint_assist", "Sprint Assist", "Re-applies sprint while you are moving."),
  AUTO_JUMP("auto_jump", "Auto Jump", "Turns on Minecraft auto jump while enabled."),
  NO_BOB("no_bob", "No Bob", "Disables view bobbing while enabled."),
  FOV_LOCK("fov_lock", "FOV Lock", "Keeps your field of view steady at 70."),
  FLIGHT("flight", "Flight", "Lets you fly with configurable mode and speed. Right-click to tune it."),
  PURE_FPS("pure_fps", "Pure FPS", "Forces aggressive client performance settings while enabled."),
  CLEAN_CROSSHAIR("clean_crosshair", "Clean Crosshair", "Adds a simple crosshair module tag."),
  HIT_COLOR("hit_color", "Hit Color Pulse", "Adds a hit-feedback module tag."),
  FULLBRIGHT("fullbright", "Fullbright", "Forces brighter visuals while enabled.");

  private final String id;
  private final String label;
  private final String description;

  ZenFeature(String id, String label, String description) {
    this.id = id;
    this.label = label;
    this.description = description;
  }

  public String id() {
    return id;
  }

  public String label() {
    return label;
  }

  public String description() {
    return description;
  }

  public static ZenFeature byId(String id) {
    for (ZenFeature feature : values()) {
      if (feature.id.equals(id)) return feature;
    }
    return null;
  }
}
