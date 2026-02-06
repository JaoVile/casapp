export class CurrencyUtil {
    static format(value: number): string {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    }
  
    static parse(value: string): number {
      const cleaned = value.replace(/[^\d,]/g, '').replace(',', '.');
      return parseFloat(cleaned);
    }
  
    static round(value: number): number {
      return Math.round(value * 100) / 100;
    }
  }