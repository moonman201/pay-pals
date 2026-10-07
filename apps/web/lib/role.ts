/**
 * Which side of the deal the viewer is on. Read from the ?as= query param.
 */
export type Role = "buyer" | "seller";

export function parseRole(value: string | string[] | undefined | null): Role {
  return value === "seller" ? "seller" : "buyer";
}

export function otherRole(role: Role): Role {
  return role === "buyer" ? "seller" : "buyer";
}

export function palChannel(role: Role): "buyer_pal" | "seller_pal" {
  return role === "buyer" ? "buyer_pal" : "seller_pal";
}

export function palName(role: Role): string {
  return role === "buyer" ? "Buyer Pal" : "Seller Pal";
}
