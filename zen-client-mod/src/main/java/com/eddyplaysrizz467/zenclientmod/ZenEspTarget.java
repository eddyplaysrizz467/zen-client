package com.eddyplaysrizz467.zenclientmod;

public enum ZenEspTarget {
  PLAYERS("players", "Players"),
  HOSTILE("hostile", "Hostile Mobs"),
  PASSIVE("passive", "Passive Mobs"),
  VILLAGERS("villagers", "Villagers"),
  ITEMS("items", "Dropped Items"),
  PROJECTILES("projectiles", "Projectiles"),
  BOATS("boats", "Boats"),
  MINECARTS("minecarts", "Minecarts"),
  ENDER_CRYSTALS("ender_crystals", "End Crystals"),
  TAMED("tamed", "Tamed Mobs");

  private final String id;
  private final String label;

  ZenEspTarget(String id, String label) {
    this.id = id;
    this.label = label;
  }

  public String id() {
    return id;
  }

  public String label() {
    return label;
  }

  public static ZenEspTarget byId(String id) {
    for (ZenEspTarget target : values()) {
      if (target.id.equals(id)) return target;
    }
    return null;
  }
}
