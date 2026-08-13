import { Text, View } from 'react-native';
import { accent, foreground } from '../../theme/tokens';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || '?';
}

export function InitialsAvatar({
  name,
  size = 44,
}: {
  name: string;
  size?: number;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        borderRadius: size / 2,
        experimental_backgroundImage: `linear-gradient(135deg, ${accent.orange}, ${accent.red})`,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Text
        style={{
          color: foreground.onAccent,
          fontSize: size * 0.36,
          fontWeight: '700',
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
