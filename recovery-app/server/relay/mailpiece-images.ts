import { fetchDealership, syncRequiredCustomValues, uploadDealershipMediaImage } from "./ghl";
import { claimMailpieceImageUpload, finishMailpieceImageUpload, logRelayAction } from "./db";
import { buildMailpieceJpegFileName, renderPdfPagesToJpegs } from "./pdf-to-jpeg";
import { downloadSlackPdf, getCurrentChannelMailpiecePdfs, postSlackMessage, type SlackChannelFile } from "./slack";
import { redactErrorDetail } from "./security";
import type { GhlCustomObjectRecord, ProductionProperties } from "./types";

export type MailpieceImageSlot = "front" | "back";
export type MailpieceImagePlan = { file: SlackChannelFile; pageNumber: number; slot: MailpieceImageSlot };

/**
 * One mailpiece uses its first two pages. Two mailpieces use each PDF's first page.
 * More than two distinct PDFs are rejected rather than silently assigning the wrong artwork.
 */
export function buildMailpieceImagePlan(files: SlackChannelFile[]): MailpieceImagePlan[] {
  if (files.length === 0) throw new Error("No qualifying non-ENV mailpiece PDF was found in the linked campaign channel");
  if (files.length === 1) {
    return [
      { file: files[0], pageNumber: 1, slot: "front" },
      { file: files[0], pageNumber: 2, slot: "back" },
    ];
  }
  if (files.length === 2) {
    return [
      { file: files[0], pageNumber: 1, slot: "front" },
      { file: files[1], pageNumber: 1, slot: "back" },
    ];
  }
  throw new Error("More than two distinct non-ENV PDFs were found; mailpiece images were not updated");
}

export const buildBdcMailpieceImagesUpdatedMessage = (subaccountName: string): string =>
  `BDC Mailpiece images have been uploaded to the *${subaccountName}* media folder and the BDC Mailpiece custom values have been updated.`;

export async function uploadCampaignMailpieceImages(input: {
  campaign: { id: number; channelId: string | null; dealershipRecordId: string | null };
  production: GhlCustomObjectRecord<ProductionProperties>;
  onStage?: (stage: string) => void | Promise<void>;
}): Promise<{ frontUrl: string; backUrl: string }> {
  if (!input.campaign.channelId) throw new Error("Campaign channel is unavailable");
  if (!input.campaign.dealershipRecordId) throw new Error("Campaign does not have a linked dealership record");

  await input.onStage?.("dealership-lookup");
  const dealership = await fetchDealership(input.campaign.dealershipRecordId);
  const locationId = dealership?.properties.loc_id?.trim();
  const apiKey = dealership?.properties.api_key?.trim();
  if (!locationId || !apiKey) throw new Error("Linked dealership does not have the required protected location connection");

  await input.onStage?.("slack-file-list");
  const files = await getCurrentChannelMailpiecePdfs(input.campaign.channelId);
  const plan = buildMailpieceImagePlan(files);
  const imageUrls: Partial<Record<MailpieceImageSlot, string>> = {};

  for (const item of plan) {
    const claim = await claimMailpieceImageUpload({
      campaignId: input.campaign.id,
      slackFileId: item.file.id,
      pageNumber: item.pageNumber,
      imageSlot: item.slot,
    });
    if (!claim.claimed) {
      if (claim.mediaUrl) imageUrls[item.slot] = claim.mediaUrl;
      continue;
    }
    try {
      await input.onStage?.(`pdf-download-${item.slot}`);
      const pdfBytes = await downloadSlackPdf(item.file);
      await input.onStage?.(`pdf-render-${item.slot}`);
      const [jpeg] = await renderPdfPagesToJpegs(pdfBytes, [item.pageNumber]);
      await input.onStage?.(`media-upload-${item.slot}`);
      const mediaUrl = await uploadDealershipMediaImage({
        locationId,
        apiKey,
        fileName: buildMailpieceJpegFileName(item.file.name, item.pageNumber),
        bytes: jpeg,
      });
      await finishMailpieceImageUpload({
        campaignId: input.campaign.id,
        slackFileId: item.file.id,
        pageNumber: item.pageNumber,
        status: "uploaded",
        mediaUrl,
      });
      imageUrls[item.slot] = mediaUrl;
    } catch (error) {
      await finishMailpieceImageUpload({
        campaignId: input.campaign.id,
        slackFileId: item.file.id,
        pageNumber: item.pageNumber,
        status: "failed",
      });
      throw new Error(`Mailpiece ${item.slot} image failed: ${redactErrorDetail(error)}`);
    }
  }

  if (!imageUrls.front || !imageUrls.back) {
    throw new Error("Both required mailpiece images are not available; Campaign Details were left unchanged");
  }
  await input.onStage?.("custom-values");
  await syncRequiredCustomValues(locationId, apiKey, {
    current_mailpiece_image: imageUrls.front,
    current_mailpiece_image_back: imageUrls.back,
  });
  const subaccountName = dealership?.properties.dealership_name?.trim() || "linked dealership";
  await input.onStage?.("slack-confirmation");
  await postSlackMessage(input.campaign.channelId, buildBdcMailpieceImagesUpdatedMessage(subaccountName));
  await logRelayAction({
    campaignId: input.campaign.id,
    action: "bdc_mailpiece_images",
    outcome: "success",
    detail: "Mailpiece JPEGs were uploaded to the linked dealership media library and Campaign Details image values were updated.",
  });
  return { frontUrl: imageUrls.front, backUrl: imageUrls.back };
}
