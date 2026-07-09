import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LookupTicketDto {
  @IsString()
  @IsNotEmpty()
  // SW-XXXX-XXXX, unambiguous alphabet (no 0/O/1/I)
  @Matches(/^SW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i, {
    message: 'ticketRef must look like SW-XXXX-XXXX',
  })
  ticketRef!: string;
}