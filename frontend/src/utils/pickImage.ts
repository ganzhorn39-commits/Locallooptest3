import { Platform, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export type PickResult = { base64: string } | { error: "permission" } | { cancelled: true };

// Pictures are stored as data URIs, so they are made small on the device before they are uploaded:
// avatars square, max 512 px; event banners 16:9, max 1280 px wide; JPEG quality 0.7.
export type ImageKind = "avatar" | "banner";
const SPEC: Record<ImageKind, { aspect: [number, number]; maxWidth: number }> = {
  avatar: { aspect: [1, 1], maxWidth: 512 },
  banner: { aspect: [16, 9], maxWidth: 1280 },
};
const QUALITY = 0.7;

export async function compressImage(uri: string, kind: ImageKind, width?: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (!width || width > SPEC[kind].maxWidth) ctx.resize({ width: SPEC[kind].maxWidth });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error("no image data");
  return `data:image/jpeg;base64,${out.base64}`;
}

// Returns a (compressed) base64 data URI, or an error/cancel marker.
export async function pickImage(source: "library" | "camera", kind: ImageKind = "avatar"): Promise<PickResult> {
  const perm = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (!perm.canAskAgain && Platform.OS !== "web") Linking.openSettings();
    return { error: "permission" };
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1, // compressed once below instead of twice
    allowsEditing: true,
    aspect: SPEC[kind].aspect,
    base64: Platform.OS === "web", // web: fallback if the browser can't re-encode the picture
  };
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset?.uri) return { cancelled: true };
  try {
    return { base64: await compressImage(asset.uri, kind, asset.width) };
  } catch (e) {
    console.log("image compression failed", e);
    if (asset.base64) return { base64: `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}` };
    if (asset.uri.startsWith("data:")) return { base64: asset.uri };
    return { cancelled: true };
  }
}
