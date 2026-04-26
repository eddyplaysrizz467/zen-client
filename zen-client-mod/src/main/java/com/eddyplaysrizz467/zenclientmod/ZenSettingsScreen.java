package com.eddyplaysrizz467.zenclientmod;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class ZenSettingsScreen extends Screen {
  private static final int BUTTON_HEIGHT = 20;
  private static final int COLUMN_WIDTH = 232;
  private static final int COLUMN_GAP = 14;
  private static final int ROW_HEIGHT = 38;

  private final Screen parent;
  private final List<Entry> entries = new ArrayList<>();

  private record Entry(ZenFeature feature, int x, int y, int width, int mainWidth) {}

  public ZenSettingsScreen(Screen parent) {
    super(Component.literal("Zen Client Settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    entries.clear();

    int leftX = (this.width / 2) - COLUMN_WIDTH - (COLUMN_GAP / 2);
    int rightX = (this.width / 2) + (COLUMN_GAP / 2);
    int startY = 72;

    ZenFeature[] features = ZenFeature.values();
    for (int i = 0; i < features.length; i++) {
      ZenFeature feature = features[i];
      int column = i % 2;
      int row = i / 2;
      int x = column == 0 ? leftX : rightX;
      int y = startY + (row * ROW_HEIGHT);
      int mainWidth = (feature == ZenFeature.ESP || feature == ZenFeature.FLIGHT) ? COLUMN_WIDTH - 72 : COLUMN_WIDTH;
      entries.add(new Entry(feature, x, y, COLUMN_WIDTH, mainWidth));

      addRenderableWidget(
        Button.builder(buildButtonText(feature), button -> {
          ZenClientMod.config().toggle(feature);
          button.setMessage(buildButtonText(feature));
        }).bounds(x, y, mainWidth, BUTTON_HEIGHT).build()
      );

      if (feature == ZenFeature.ESP || feature == ZenFeature.FLIGHT) {
        String configLabel = feature == ZenFeature.ESP ? "Targets" : "Tune";
        addRenderableWidget(
          Button.builder(Component.literal(configLabel), button -> this.minecraft.setScreen(
            feature == ZenFeature.ESP ? new ZenEspScreen(this) : new ZenFlightScreen(this)
          ))
            .bounds(x + mainWidth + 8, y, 64, BUTTON_HEIGHT)
            .build()
        );
      }
    }

    addRenderableWidget(
      Button.builder(Component.literal("Back"), button -> this.minecraft.setScreen(parent))
        .bounds((this.width / 2) - 68, this.height - 34, 136, 20)
        .build()
    );
  }

  private Component buildButtonText(ZenFeature feature) {
    boolean enabled = ZenClientMod.config().isEnabled(feature);
    String state = enabled ? "ON" : "OFF";
    return Component.literal(feature.label() + "  [" + state + "]");
  }

  @Override
  public void render(GuiGraphics context, int mouseX, int mouseY, float delta) {
    int panelLeft = (this.width / 2) - 250;
    int panelRight = (this.width / 2) + 250;
    int panelTop = 18;
    int panelBottom = this.height - 48;
    context.fill(panelLeft, panelTop, panelRight, panelBottom, 0xCC090909);
    context.fill(panelLeft, panelTop, panelRight, panelTop + 34, 0xE1121212);
    context.fill(panelLeft + 18, panelTop + 44, panelRight - 18, panelTop + 45, 0x332E2E2E);

    super.render(context, mouseX, mouseY, delta);

    context.drawCenteredString(this.font, this.title, this.width / 2, 28, 0xFFFFFFFF);
    context.drawCenteredString(
      this.font,
      Component.literal(ZenFeature.values().length + " live PvP/QoL modules for Zen Client"),
      this.width / 2,
      46,
      0xFF9E9E9E
    );

    for (Entry entry : entries) {
      int descY = entry.y() + BUTTON_HEIGHT + 2;
      int descColor = ZenClientMod.config().isEnabled(entry.feature()) ? 0xFFBEE8C3 : 0xFF8D8D8D;
      String description = switch (entry.feature()) {
        case ESP -> entry.feature().description() + " Use Targets to choose what glows.";
        case FLIGHT -> entry.feature().description() + " Use Tune to adjust mode and speed.";
        default -> entry.feature().description();
      };
      context.drawString(this.font, Component.literal(description), entry.x() + 2, descY, descColor, false);
    }
  }

  @Override
  public void onClose() {
    this.minecraft.setScreen(parent);
  }
}
