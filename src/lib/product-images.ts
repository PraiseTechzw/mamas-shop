import type { ImageSourcePropType } from 'react-native';
import type { Product } from '@/db/schema';

const productImages = [
 { match: 'coca-cola', image: require('@/assets/images/products/coke.png') },
 { match: 'coke', image: require('@/assets/images/products/coke.png') },
 { match: 'mirinda orange', image: require('@/assets/images/products/mirinda-orange.png') },
 { match: 'mirinda grape', image: require('@/assets/images/products/mirinda-grape.png') },
 { match: 'fruiticana', image: require('@/assets/images/products/fruticana.png') },
 { match: 'wildcat', image: require('@/assets/images/products/wildcat.png') },
 { match: 'sting', image: require('@/assets/images/products/sting.png') },
 { match: 'dragon', image: require('@/assets/images/products/dragon.png') },
 { match: 'switch', image: require('@/assets/images/products/switch.png') },
 { match: 'shumba', image: require('@/assets/images/products/shumba-maheu.png') },
 { match: 'pfuko', image: require('@/assets/images/products/pfuko-mahewu.png') },
 { match: 'fuko', image: require('@/assets/images/products/pfuko-mahewu.png') },
 { match: 'mahe', image: require('@/assets/images/products/pfuko-mahewu.png') },
 { match: 'aqua clear', image: require('@/assets/images/products/aquaclear.png') },
 { match: 'vivo', image: require('@/assets/images/products/Vivion-water.png') },
 { match: 'polony', image: require('@/assets/images/products/polony.png') },
 { match: 'king cos', image: require('@/assets/images/products/king-kurls.png') },
 { match: 'king kurls', image: require('@/assets/images/products/king-kurls.png') },
 { match: 'mega snack', image: require('@/assets/images/products/mega-snax.png') },
 { match: 'mega snax', image: require('@/assets/images/products/mega-snax.png') },
 { match: 'mega-snax', image: require('@/assets/images/products/mega-snax.png') },
 { match: 'loose biscuit', image: require('@/assets/images/products/biscuts-loose.png') },
 { match: 'biscuits loose', image: require('@/assets/images/products/biscuts-loose.png') },
 { match: 'bulk biscuit', image: require('@/assets/images/products/biscuts-loose.png') },
 { match: 'bulk biscuits', image: require('@/assets/images/products/biscuts-loose.png') },
 { match: 'cream biscuit', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'creamy biscuit', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'biscuit cream', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'biscuits cream', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'biscuit creamy', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'biscuits creamy', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'cream filled biscuit', image: require('@/assets/images/products/biscuts-creamy.png') },
 { match: 'biscuit', image: require('@/assets/images/products/biscuits-cookies.png') },
 { match: 'cookie', image: require('@/assets/images/products/biscuits-cookies.png') },
 { match: 'econet', image: require('@/assets/images/products/econet.png') },
 { match: 'netone', image: require('@/assets/images/products/netone.png') },
 { match: 'revive', image: require('@/assets/images/products/revive-drink.png') },
];

export function productImage(name: string) {
 const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
 return productImages.find(({ match }) => normalized.includes(match))?.image;
}

export function imageSource(product: Pick<Product, 'name' | 'image_uri'>): ImageSourcePropType | undefined {
 if (product.image_uri) return { uri: product.image_uri };
 return productImage(product.name);
}

