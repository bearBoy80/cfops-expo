import { Platform, type ColorValue } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { LucideIcon } from 'lucide-react-native';

interface Props {
  /** SF Symbol rendered on iOS. */
  symbol: SymbolViewProps['name'];
  /** Lucide icon rendered on Android and wherever the symbol is unavailable. */
  Fallback: LucideIcon;
  size?: number;
  color: ColorValue;
}

/** Platform icon: SF Symbols on iOS with a lucide fallback elsewhere. */
export function Icon({ symbol, Fallback, size = 20, color }: Props) {
  const fallbackColor = color as string;
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        fallback={<Fallback color={fallbackColor} size={size} />}
        name={symbol}
        size={size}
        tintColor={color}
      />
    );
  }
  return <Fallback color={fallbackColor} size={size} />;
}
