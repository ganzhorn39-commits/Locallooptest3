import React, { useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useTheme } from "@/src/theme/theme";
import { DEFAULT_REGION } from "@/src/constants/categories";
import { darkMapStyle } from "@/src/components/mapStyle";

type Props = {
  coord: { latitude: number; longitude: number };
  onChange: (c: { latitude: number; longitude: number }) => void;
};

export default function LocationPicker({ coord, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const [c, setC] = useState(coord);

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]} testID="location-picker">
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...DEFAULT_REGION, latitude: coord.latitude, longitude: coord.longitude }}
        customMapStyle={isDark ? darkMapStyle : []}
        onPress={(e) => {
          const nc = e.nativeEvent.coordinate;
          setC(nc);
          onChange(nc);
        }}
      >
        <Marker
          coordinate={c}
          draggable
          onDragEnd={(e) => {
            const nc = e.nativeEvent.coordinate;
            setC(nc);
            onChange(nc);
          }}
          pinColor={colors.brand}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 200, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
});
