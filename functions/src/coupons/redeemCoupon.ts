import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

export interface RedeemCouponRequest {
  code: string;
}

export interface RedeemCouponResponse {
  success: boolean;
  message: string;
}

/**
 * Redeems a one-time-use coupon. If the code is valid and unused:
 * - Marks the coupon as used (usedBy = current user id)
 * - Sets the user's userType to "admin"
 * @param {Object} request - The callable request (auth + data)
 * @return {Promise<RedeemCouponResponse>} Success message or throws HttpsError
 */
export const redeemCoupon = onCall(
  async (request): Promise<RedeemCouponResponse> => {
    try {
      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError(
          "unauthenticated",
          "You must be signed in to redeem a coupon.",
        );
      }

      const data = request.data as RedeemCouponRequest | undefined;
      const code = data?.code;
      if (typeof code !== "string" || !code.trim()) {
        throw new HttpsError("invalid-argument", "Please enter a coupon code.");
      }

      const normalizedCode = code.trim().toUpperCase();

      const couponsRef = db.collection("coupons");
      const snapshot = await couponsRef
        .where("code", "==", normalizedCode)
        .limit(1)
        .get();

      if (snapshot.empty) {
        throw new HttpsError(
          "not-found",
          "This coupon code is invalid or does not exist.",
        );
      }

      const couponDoc = snapshot.docs[0];
      const couponData = couponDoc.data();
      const usedBy = couponData.usedBy ?? null;

      if (usedBy) {
        throw new HttpsError(
          "failed-precondition",
          "This coupon has already been used.",
        );
      }

      const couponRef = couponDoc.ref;
      const userRef = db.collection("users").doc(userId);

      await db.runTransaction(async (transaction) => {
        transaction.update(couponRef, {
          usedBy: userId,
        });
        transaction.update(userRef, {
          userType: "admin",
          updatedAt: Timestamp.now(),
        });
      });

      logger.info("Coupon redeemed", {
        userId,
        couponId: couponDoc.id,
        code: normalizedCode,
      });

      return {
        success: true,
        message: "Coupon redeemed! You now have admin access.",
      };
    } catch (error: unknown) {
      if (error instanceof HttpsError) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error redeeming coupon", {
        error: errorMessage,
        userId: request.auth?.uid,
      });
      throw new HttpsError(
        "internal",
        errorMessage || "Failed to redeem coupon",
      );
    }
  },
);
