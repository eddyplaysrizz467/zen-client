package com.eddyplaysrizz467.zenclientmod;

public enum ZenFlightMode {
  VANILLA("vanilla", "Vanilla"),
  DRIFT("drift", "Drift"),
  DASH("dash", "Dash"),
  GLIDE("glide", "Glide"),
  HOVER("hover", "Hover"),
  BOOST("boost", "Boost"),
  CRUISE("cruise", "Cruise"),
  JET("jet", "Jet"),
  BRAKE("brake", "Brake"),
  SWIFT("swift", "Swift");

  private final String id;
  private final String label;

  ZenFlightMode(String id, String label) {
    this.id = id;
    this.label = label;
  }

  public String id() {
    return id;
  }

  public String label() {
    return label;
  }

  public static ZenFlightMode byId(String id) {
    for (ZenFlightMode mode : values()) {
      if (mode.id.equals(id)) return mode;
    }
    return VANILLA;
  }

  public ZenFlightMode next() {
    ZenFlightMode[] values = values();
    return values[(ordinal() + 1) % values.length];
  }
}
