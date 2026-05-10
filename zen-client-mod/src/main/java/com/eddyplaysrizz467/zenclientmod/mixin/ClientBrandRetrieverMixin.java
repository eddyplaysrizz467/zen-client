package com.eddyplaysrizz467.zenclientmod.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(targets = "net.minecraft.client.ClientBrandRetriever")
public final class ClientBrandRetrieverMixin {
  @Inject(method = "getClientModName", at = @At("HEAD"), cancellable = true)
  private static void zenclient$overrideBrand(CallbackInfoReturnable<String> cir) {
    cir.setReturnValue("Zen Client - Fabric");
  }
}
