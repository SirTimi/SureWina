import {
    IsString,
    IsNotEmpty,
    MaxLength
} from "class-validator";

export class ConfirmRemittanceDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    bankTransferRef!: string;
}