-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
