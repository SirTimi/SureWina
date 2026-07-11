import {
    IsString,
    IsNotEmpty,
} from "class-validator";

export class LookupPrizeDto {
    @IsString()
    @IsNotEmpty()
    ticketRef!: string;
}